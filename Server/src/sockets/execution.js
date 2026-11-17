// Running the room's code in a Docker container and streaming its output.
import { spawn } from "child_process"
import fs from "fs"
import path from "path"
import { v4 as uuid } from "uuid"

import { getDockerCommand } from "../execution/dockerCommand.js"
import { codeOf, getRoom, isMember, memberName } from "../rooms.js"

const EXECUTION_TIMEOUT_MS = 5000
const EXTENSIONS = { java: "java", python: "py", cpp: "cpp" }

// socket.id -> { roomId, process, jobDir }
const running = new Map()

function cleanupJob(jobDir) {
  try {
    fs.rmSync(jobDir, { recursive: true, force: true })
  } catch {
    // The folder is in the server's own job area; a leftover is harmless.
  }
}

// Stops whatever this socket started, e.g. when it disconnects.
export function stopRunsFor(socketId) {
  const entry = running.get(socketId)
  if (!entry) return
  entry.process.kill()
  cleanupJob(entry.jobDir)
  running.delete(socketId)
}

export function registerExecutionHandlers(io, socket) {
  // Runs the room's current document, not text sent by the client, so what
  // runs is what everyone sees.
  socket.on("run-code", ({ roomId }) => {
    const room = getRoom(roomId)
    if (!room || !isMember(room, socket.id)) return
    const code = codeOf(room)
    const language = room.language

    if (room.isRunning) {
      socket.emit("run-denied", { message: "Code is already running" })
      return
    }

    room.isRunning = true
    room.runningBy = { socketId: socket.id, username: memberName(room, socket.id) }
    io.to(roomId).emit("execution-started", { username: room.runningBy.username })

    const jobDir = path.join("jobs", uuid())
    fs.mkdirSync(jobDir, { recursive: true })
    const filePath = path.join(jobDir, `Main.${EXTENSIONS[language] || "cpp"}`)
    fs.writeFileSync(filePath, code)

    const child = spawn(getDockerCommand(language, filePath), {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"]
    })
    running.set(socket.id, { roomId, process: child, jobDir })

    let finished = false
    const finish = ({ timedOut = false, errorMessage = null } = {}) => {
      if (finished) return
      finished = true

      const activeRoom = getRoom(roomId)
      if (activeRoom) {
        activeRoom.isRunning = false
        activeRoom.runningBy = null
      }
      if (timedOut) io.to(roomId).emit("program-output", { output: "\n⏱ Execution timed out (5s limit)\n" })
      if (errorMessage) io.to(roomId).emit("program-output", { output: `\n❌ ${errorMessage}\n` })
      io.to(roomId).emit("execution-ended")

      if (running.get(socket.id)?.process === child) {
        cleanupJob(jobDir)
        running.delete(socket.id)
      }
    }

    const killTimer = setTimeout(() => {
      if (!child.killed) child.kill("SIGTERM")
      finish({ timedOut: true })
    }, EXECUTION_TIMEOUT_MS)

    const forward = (data) => io.to(roomId).emit("program-output", { output: data.toString() })
    child.stdout.on("data", forward)
    child.stderr.on("data", forward)

    child.on("error", (error) => {
      clearTimeout(killTimer)
      finish({ errorMessage: error.message || "Failed to start code execution process" })
    })
    child.on("close", () => {
      clearTimeout(killTimer)
      finish()
    })
  })

  socket.on("program-input", ({ roomId, input }) => {
    const entry = running.get(socket.id)
    if (!entry) return

    entry.process.stdin.write(input + "\n")
    io.to(roomId).emit("program-input", { input })
  })
}
