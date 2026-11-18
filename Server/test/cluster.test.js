// Two real server processes sharing one Redis, with clients on different
// servers in the same room. Skipped unless REDIS_URL is set.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { Redis } from "ioredis"
import { io } from "socket.io-client"
import * as Y from "yjs"
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness"

const REDIS_URL = process.env.REDIS_URL
const skip = REDIS_URL ? false : "set REDIS_URL to run"
const SERVER_FILE = fileURLToPath(new URL("../index.js", import.meta.url))
const BASE_PORT = 3600 + Math.floor(Math.random() * 300)
const URLS = { A: `http://localhost:${BASE_PORT}`, B: `http://localhost:${BASE_PORT + 1}` }

const servers = []
const sockets = []
let workDir
let redis

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function room(name) {
  const h = createHash("md5").update(name + process.pid).digest("hex")
  return `${h.slice(0, 3)}-${h.slice(3, 7)}-${h.slice(7, 10)}`
}

function next(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), 5000)
    socket.once(event, (payload) => {
      clearTimeout(timer)
      resolve(payload)
    })
  })
}

async function until(check, what) {
  const deadline = Date.now() + 5000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await sleep(25)
  }
}

function startServer(name, port) {
  const env = { ...process.env, PORT: String(port), REDIS_URL, INSTANCE_NAME: name }
  delete env.GEMINI_API_KEY
  const child = spawn(process.execPath, [SERVER_FILE], { cwd: workDir, env })
  servers.push(child)
  let stderr = ""
  child.stderr.on("data", (chunk) => (stderr += chunk))
  return new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => String(chunk).includes("Server running") && resolve())
    child.on("exit", (code) => reject(new Error(`server ${name} exited with ${code}:\n${stderr}`)))
  })
}

// Joins `roomId` through server `on` ("A" or "B") with its own Yjs copy.
async function join(on, roomId, username) {
  const socket = io(URLS[on], { transports: ["websocket"], forceNew: true })
  sockets.push(socket)
  const doc = new Y.Doc()
  socket.on("yjs-update", ({ update }) => Y.applyUpdate(doc, new Uint8Array(update), "remote"))
  doc.on("update", (update, origin) => origin !== "remote" && socket.emit("yjs-update", { roomId, update }))

  const joined = next(socket, "join-success")
  const synced = next(socket, "yjs-update")
  socket.emit("join-room", { roomId, username })
  await joined
  await synced
  return { socket, doc, text: () => doc.getText("code").toString() }
}

before(async () => {
  if (!REDIS_URL) return
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "codetogether-cluster-"))
  redis = new Redis(REDIS_URL)
  await Promise.all([startServer("A", BASE_PORT), startServer("B", BASE_PORT + 1)])
})

// Stops a server, and kills it outright if it hasn't exited 3 s after
// SIGTERM, saying so, so a shutdown that hangs shows up instead of stalling.
async function stopServer(child, name) {
  if (child.exitCode !== null || child.signalCode) return
  const exited = new Promise((resolve) => child.once("exit", resolve))
  child.kill("SIGTERM")
  const timer = setTimeout(() => {
    console.error(`server ${name} still running 3 s after SIGTERM; killing it`)
    child.kill("SIGKILL")
  }, 3000)
  await exited
  clearTimeout(timer)
}

after(async () => {
  for (const socket of sockets) socket.disconnect()
  await Promise.all(servers.map((child, i) => stopServer(child, ["A", "B"][i])))
  await redis?.quit()
  if (workDir) fs.rmSync(workDir, { recursive: true, force: true })
}, { timeout: 20_000 })

test("both servers report that they share rooms through Redis", { skip }, async () => {
  for (const [name, url] of Object.entries(URLS)) {
    const health = await (await fetch(`${url}/health`)).json()
    assert.deepEqual({ instance: health.instance, store: health.store }, { instance: name, store: "redis" })
  }
})

test("people on different servers see each other in the member list", { skip }, async () => {
  const id = room("members")
  const alice = await join("A", id, "alice")
  const update = next(alice.socket, "members-update")
  await join("B", id, "bob")
  assert.deepEqual((await update).map((m) => m.username).sort(), ["alice", "bob"])
})

test("names are unique across servers", { skip }, async () => {
  const id = room("names")
  await join("A", id, "alice")

  const socket = io(URLS.B, { transports: ["websocket"], forceNew: true })
  sockets.push(socket)
  const error = next(socket, "join-error")
  socket.emit("join-room", { roomId: id, username: "ALICE" })
  assert.match((await error).message, /already taken/)
})

test("edits typed at the same moment on two servers converge", { skip }, async () => {
  const id = room("converge")
  const alice = await join("A", id, "alice")
  const bob = await join("B", id, "bob")
  await until(() => alice.text() === bob.text(), "both copies to start equal")

  for (let i = 0; i < 25; i++) {
    alice.doc.getText("code").insert(0, "a")
    bob.doc.getText("code").insert(bob.doc.getText("code").length, "b")
  }
  await until(() => alice.text() === bob.text(), "the copies to converge")
  assert.equal((alice.text().match(/a/g) || []).length >= 25, true)
  assert.equal(alice.text().endsWith("b".repeat(25)), true)

  // A third person on server A gets the merged text, including bob's edits
  // that reached A only through the other server.
  const carol = await join("A", id, "carol")
  assert.equal(carol.text(), alice.text())
})

test("a server that never had the room rebuilds it from Redis", { skip }, async () => {
  const id = room("rebuild")
  const alice = await join("A", id, "alice")
  alice.doc.getText("code").insert(0, "// written on A\n")
  await sleep(200)

  const eve = await join("B", id, "eve")
  assert.equal(eve.text(), alice.text())
  assert.match(eve.text(), /written on A/)
})

test("a language change on one server reaches people on the other", { skip }, async () => {
  const id = room("language")
  const alice = await join("A", id, "alice")
  const bob = await join("B", id, "bob")

  const changed = next(alice.socket, "language-changed")
  bob.socket.emit("change-language", { roomId: id, language: "python" })
  assert.equal((await changed).language, "python")
  await until(() => alice.text() === 'print("Hello, World!")', "alice to get the python template")

  // Server A's own idea of the language changed too.
  const state = next(alice.socket, "room-state")
  alice.socket.emit("request-room-state", { roomId: id })
  assert.equal((await state).language, "python")
})

test("a cursor disappears on the other server when its owner leaves", { skip }, async () => {
  const id = room("cursor")
  const alice = await join("A", id, "alice")
  const bob = await join("B", id, "bob")

  const seen = new Awareness(alice.doc)
  alice.socket.on("awareness-update", ({ update }) => applyAwarenessUpdate(seen, new Uint8Array(update), "remote"))

  const mine = new Awareness(bob.doc)
  mine.setLocalStateField("user", { name: "bob" })
  bob.socket.emit("awareness-update", { roomId: id, update: encodeAwarenessUpdate(mine, [bob.doc.clientID]) })
  await until(() => seen.getStates().has(bob.doc.clientID), "alice to see bob's cursor")

  bob.socket.disconnect()
  await until(() => !seen.getStates().has(bob.doc.clientID), "bob's cursor to go")
  seen.destroy()
  mine.destroy()
})

test("the room is deleted from Redis once everyone on both servers has left", { skip }, async () => {
  const id = room("cleanup")
  const alice = await join("A", id, "alice")
  const bob = await join("B", id, "bob")
  assert.ok((await redis.exists(`ct:room:${id}:updates`)) === 1)

  alice.socket.disconnect()
  await sleep(300)
  assert.ok((await redis.exists(`ct:room:${id}:updates`)) === 1, "still in use by bob")

  bob.socket.disconnect()
  await until(async () => (await redis.exists(`ct:room:${id}:updates`)) === 0, "the room's keys to be deleted")
})
