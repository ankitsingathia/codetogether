// Starts the real server with no Gemini key and drives it over Socket.IO,
// the same way two browser tabs would. Nothing here calls Gemini or Docker.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { io } from "socket.io-client"
import * as Y from "yjs"
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness"

const SERVER_FILE = fileURLToPath(new URL("../index.js", import.meta.url))
const PORT = 3100 + Math.floor(Math.random() * 500)
const BASE_URL = `http://localhost:${PORT}`

let server
let workDir
const sockets = []

// Resolves with the next payload of `event`, or fails after 3 seconds.
function next(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), 3000)
    socket.once(event, (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

function connect() {
  const socket = io(BASE_URL, { transports: ["websocket"], forceNew: true })
  sockets.push(socket)
  return socket
}

// A client's own copy of the document, wired to its socket the way the
// browser client does it: local edits go out, remote edits come in.
function attachDoc(socket, roomId) {
  const doc = new Y.Doc()
  socket.on("yjs-update", ({ update }) => Y.applyUpdate(doc, new Uint8Array(update), "remote"))
  doc.on("update", (update, origin) => {
    if (origin !== "remote") socket.emit("yjs-update", { roomId, update })
  })
  return doc
}

async function join(roomId, username) {
  const socket = connect()
  const doc = attachDoc(socket, roomId)
  const joined = next(socket, "join-success")
  const synced = next(socket, "yjs-update")
  socket.emit("join-room", { roomId, username })
  await joined
  await synced
  return { socket, doc, text: () => doc.getText("code").toString() }
}

// Waits until check() is true, or fails after 2 seconds.
async function until(check, what) {
  const deadline = Date.now() + 2000
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(20)
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

before(async () => {
  // Run from an empty folder so the assistant memory files the server writes
  // land there, and so no local .env with a real key gets picked up.
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "codetogether-test-"))
  const env = { ...process.env, PORT: String(PORT) }
  delete env.GEMINI_API_KEY

  server = spawn(process.execPath, [SERVER_FILE], { cwd: workDir, env })

  let stderr = ""
  server.stderr.on("data", (chunk) => (stderr += chunk))

  await new Promise((resolve, reject) => {
    server.stdout.on("data", (chunk) => {
      if (String(chunk).includes("Server running")) resolve()
    })
    server.on("exit", (code) => reject(new Error(`server exited with ${code}:\n${stderr}`)))
  })
})

after(async () => {
  for (const socket of sockets) socket.disconnect()
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve))
    server.kill()
    // Windows keeps the folder locked until the process has really gone.
    await exited
  }
  fs.rmSync(workDir, { recursive: true, force: true })
})

test("starts without a Gemini key and answers HTTP", async () => {
  const res = await fetch(BASE_URL)
  assert.equal(res.status, 200)
})

test("a new room starts with the Java template", async () => {
  const socket = connect()
  attachDoc(socket, "room-template")
  const language = next(socket, "language-changed")
  const state = next(socket, "yjs-update")
  socket.emit("join-room", { roomId: "room-template", username: "alice" })

  assert.equal((await language).language, "java")
  const doc = new Y.Doc()
  Y.applyUpdate(doc, new Uint8Array((await state).update))
  assert.match(doc.getText("code").toString(), /public class Main/)
})

test("usernames are unique within a room, ignoring case", async () => {
  await join("room-names", "alice")

  const other = connect()
  const status = next(other, "username-status")
  other.emit("check-username", { roomId: "room-names", username: "ALICE" })
  assert.equal((await status).available, false)

  const error = next(other, "join-error")
  other.emit("join-room", { roomId: "room-names", username: "Alice" })
  assert.match((await error).message, /already taken/)
})

test("two people typing at the same moment both keep their edits", async () => {
  const alice = await join("room-crdt", "alice")
  const bob = await join("room-crdt", "bob")
  await until(() => alice.text() === bob.text(), "both copies to start equal")
  const original = alice.text()

  // Both edit before either has seen the other's change. With whole-document
  // sync, whichever arrived last would wipe out the other.
  alice.doc.getText("code").insert(0, "// alice was here\n")
  bob.doc.getText("code").insert(original.length, "\n// bob was here")

  await until(() => alice.text() === bob.text(), "the copies to converge")
  assert.match(alice.text(), /alice was here/)
  assert.match(alice.text(), /bob was here/)

  // Someone joining afterwards gets the same merged text from the server.
  const carol = await join("room-crdt", "carol")
  assert.equal(carol.text(), alice.text())
})

test("concurrent edits at the same position converge to the same text", async () => {
  const alice = await join("room-same-spot", "alice")
  const bob = await join("room-same-spot", "bob")
  await until(() => alice.text() === bob.text(), "both copies to start equal")

  for (let i = 0; i < 20; i++) {
    alice.doc.getText("code").insert(0, "a")
    bob.doc.getText("code").insert(0, "b")
  }

  await until(() => alice.text() === bob.text(), "the copies to converge")
  assert.equal((alice.text().match(/a/g) || []).length >= 20, true)
  assert.equal(alice.text().slice(0, 40).replace(/[ab]/g, ""), "")
})

test("an edit is not echoed back to the person who made it", async () => {
  const alice = await join("room-echo", "alice")
  const bob = await join("room-echo", "bob")

  let echoed = false
  alice.socket.on("yjs-update", () => (echoed = true))
  alice.doc.getText("code").insert(0, "x")

  await until(() => bob.text().startsWith("x"), "bob to get the edit")
  await sleep(150)
  assert.equal(echoed, false)
})

test("a socket that has not joined the room cannot edit it", async () => {
  const alice = await join("room-closed", "alice")
  const before = alice.text()

  const outsider = connect()
  const doc = attachDoc(outsider, "room-closed")
  doc.getText("code").insert(0, "spam")
  await sleep(200)

  assert.equal(alice.text(), before)
})

test("a malformed update is dropped without crashing the server", async () => {
  const alice = await join("room-garbage", "alice")
  alice.socket.emit("yjs-update", { roomId: "room-garbage", update: new Uint8Array([1, 2, 3, 250, 99]) })
  alice.socket.emit("yjs-update", { roomId: "room-garbage", update: "not bytes" })
  await sleep(100)

  assert.equal((await fetch(BASE_URL)).status, 200)
  const bob = await join("room-garbage", "bob")
  assert.equal(bob.text(), alice.text())
})

test("changing the language replaces the text for everyone", async () => {
  const alice = await join("room-lang", "alice")
  const bob = await join("room-lang", "bob")

  const changed = next(bob.socket, "language-changed")
  alice.socket.emit("change-language", { roomId: "room-lang", language: "python" })
  assert.equal((await changed).language, "python")

  await until(() => bob.text() === 'print("Hello, World!")', "bob to get the python template")
  await until(() => alice.text() === bob.text(), "alice to match")

  // An unknown language is ignored.
  alice.socket.emit("change-language", { roomId: "room-lang", language: "rust" })
  await sleep(100)
  assert.equal(bob.text(), 'print("Hello, World!")')
})

test("a member's cursor disappears for others when they leave", async () => {
  const alice = await join("room-cursor", "alice")
  const bob = await join("room-cursor", "bob")

  const aliceAwareness = new Awareness(alice.doc)
  const bobAwareness = new Awareness(bob.doc)
  bob.socket.on("awareness-update", ({ update }) =>
    applyAwarenessUpdate(bobAwareness, new Uint8Array(update), "remote"))

  aliceAwareness.setLocalStateField("user", { name: "alice" })
  alice.socket.emit("awareness-update", {
    roomId: "room-cursor",
    update: encodeAwarenessUpdate(aliceAwareness, [alice.doc.clientID])
  })
  await until(() => bobAwareness.getStates().has(alice.doc.clientID), "bob to see alice's cursor")

  alice.socket.disconnect()
  await until(() => !bobAwareness.getStates().has(alice.doc.clientID), "alice's cursor to be removed")

  aliceAwareness.destroy()
  bobAwareness.destroy()
})

test("a room resets once everyone has left", async () => {
  const first = await join("room-reset", "alice")
  first.doc.getText("code").insert(0, "changed ")
  await sleep(100)
  first.socket.disconnect()
  await sleep(200)

  const again = await join("room-reset", "alice")
  assert.doesNotMatch(again.text(), /changed/)
  assert.match(again.text(), /public class Main/)
})

test("review and assistant requests without a key get an error, not a crash", async () => {
  const { socket } = await join("room-ai", "alice")

  const review = next(socket, "review-result")
  socket.emit("review-code", { roomId: "room-ai", code: "print(1)", language: "python" })
  const reviewResult = await review
  assert.equal(reviewResult.success, false)
  assert.match(reviewResult.error, /API key is missing/)

  const answer = next(socket, "assistant-result")
  socket.emit("assistant-query", {
    roomId: "room-ai",
    code: "print(1)",
    language: "python",
    question: "What does this print?"
  })
  const answerResult = await answer
  assert.equal(answerResult.success, false)
  assert.match(answerResult.error, /API key is missing/)

  // And the server is still up afterwards.
  assert.equal((await fetch(BASE_URL)).status, 200)
})
