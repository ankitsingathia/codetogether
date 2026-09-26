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

async function join(roomId, username) {
  const socket = connect()
  const joined = next(socket, "join-success")
  const synced = next(socket, "sync-code")
  socket.emit("join-room", { roomId, username })
  await joined
  return { socket, synced: await synced }
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
  const { synced } = await join("room-template", "alice")
  assert.equal(synced.language, "java")
  assert.match(synced.code, /public class Main/)
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

test("an edit reaches the other members but is not echoed to the sender", async () => {
  const alice = await join("room-sync", "alice")

  const members = next(alice.socket, "members-update")
  const bob = await join("room-sync", "bob")
  assert.deepEqual((await members).map((m) => m.username), ["alice", "bob"])

  let echoed = false
  alice.socket.on("code-change", () => (echoed = true))

  const received = next(bob.socket, "code-change")
  alice.socket.emit("code-change", { roomId: "room-sync", code: "print('hi')" })
  assert.equal((await received).code, "print('hi')")

  await sleep(200)
  assert.equal(echoed, false)
})

test("a room resets once everyone has left", async () => {
  const first = await join("room-reset", "alice")
  first.socket.emit("code-change", { roomId: "room-reset", code: "changed" })
  await sleep(100)
  first.socket.disconnect()
  await sleep(200)

  const { synced } = await join("room-reset", "alice")
  assert.match(synced.code, /public class Main/)
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
