// Running the room's code: checks, the shared job queue, and streaming the
// output to everyone in the room.
import { v4 as uuid } from "uuid"

import { JobQueue, QueueFullError } from "../execution/queue.js"
import { runJob } from "../execution/runner.js"
import { LIMITS, byteLength, rateLimiter } from "../limits.js"

// One queue for the whole server: at most RUN_CONCURRENCY containers at once.
export const runQueue = new JobQueue({
  concurrency: Number(process.env.RUN_CONCURRENCY) || 2,
  maxWaiting: 20
})
const runLimiter = rateLimiter({ max: 10, windowMs: 60_000 })

// socket.id -> { roomId, job, stop?, child? } for the run that socket started
const active = new Map()

// Stops whatever this socket started, waiting or running, e.g. when it
// disconnects.
export function stopRunsFor(socketId) {
  const entry = active.get(socketId)
  if (!entry) return
  if (!runQueue.cancel(entry.job)) entry.stop?.()
  runLimiter.forget(socketId)
}

const seconds = (ms) => Math.ceil(ms / 1000)

// How long the room's run lock lasts if a server dies without releasing it:
// long enough to cover a wait in the queue plus the run itself.
const RUN_LOCK_MS = 2 * 60 * 1000

export function registerExecutionHandlers(io, socket, { rooms, store }) {
  // Runs the room's current document, not text sent by the client, so what
  // runs is what everyone sees.
  socket.on("run-code", async ({ roomId } = {}) => {
    const room = socket.data.roomId === roomId ? rooms.get(roomId) : undefined
    if (!room) return
    const deny = (message) => socket.emit("run-denied", { message })

    const code = rooms.codeOf(room)
    if (!code.trim()) return deny("There is no code to run.")
    if (byteLength(code) > LIMITS.codeBytes) {
      return deny(`The code is too long to run (limit ${LIMITS.codeBytes / 1024} KB).`)
    }

    const wait = runLimiter.take(socket.id)
    if (wait) return deny(`Too many runs. Try again in ${seconds(wait)} s.`)

    // One run per room at a time, across all servers: the lock is in the store.
    if (!(await store.acquireRunLock(roomId, socket.id, RUN_LOCK_MS))) {
      return deny("Code is already running in this room.")
    }

    const language = room.language
    io.to(roomId).emit("execution-started", { username: socket.data.username })

    const say = (output) => io.to(roomId).emit("program-output", { output })
    const entry = { roomId }
    entry.job = {
      onPosition: (position) => io.to(roomId).emit("execution-queued", { position }),
      run: () => runJob({
        jobId: uuid(),
        language,
        code,
        timeoutMs: LIMITS.runTimeoutMs,
        maxOutputBytes: LIMITS.outputBytes,
        onOutput: say,
        onStart: ({ child, stop }) => Object.assign(entry, { child, stop })
      })
    }
    active.set(socket.id, entry)

    try {
      const result = await runQueue.add(entry.job)
      if (result.timedOut) say(`\n⏱ Stopped after ${seconds(LIMITS.runTimeoutMs)} s (time limit)\n`)
      if (result.truncated) say(`\n✂ Stopped: output passed ${LIMITS.outputBytes / 1024} KB\n`)
    } catch (error) {
      if (error instanceof QueueFullError) say(`\n❌ ${error.message}\n`)
      else if (error?.code === "ENOENT") say("\n❌ The server can't start Docker, so code can't run here.\n")
      else if (error?.message !== "Cancelled") say(`\n❌ ${error?.message || "The run failed to start."}\n`)
    } finally {
      if (active.get(socket.id) === entry) active.delete(socket.id)
      await store.releaseRunLock(roomId, socket.id).catch(() => {})
      io.to(roomId).emit("execution-ended")
    }
  })

  // Only the person who started the run can type into it.
  socket.on("program-input", ({ input } = {}) => {
    const entry = active.get(socket.id)
    if (!entry?.child || typeof input !== "string" || input.length > LIMITS.inputChars) return

    entry.child.stdin.write(input + "\n")
    io.to(entry.roomId).emit("program-input", { input })
  })
}
