// Runs one job in its own container and enforces the time and output limits.
import { execFile, spawn } from "child_process"
import fs from "fs"
import path from "path"

import { FILE_NAMES, getDockerArgs } from "./dockerCommand.js"

// Stops the container by name. Killing the `docker run` client process alone
// leaves the container running: the client is only attached to it.
function killContainer(name) {
  return new Promise((resolve) => {
    execFile("docker", ["kill", name], () => resolve())
  })
}

function startContainer(args) {
  return spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] })
}

/**
 * Resolves with { exitCode, timedOut, truncated } once the program ends, is
 * stopped for running too long, or is stopped for printing too much.
 * Rejects only if the container could not be started.
 *
 * `start` and `kill` are swappable so tests can run without Docker.
 */
export function runJob({
  jobId,
  language,
  code,
  workRoot = "jobs",
  timeoutMs,
  maxOutputBytes,
  onOutput,
  onStart,
  start = startContainer,
  kill = killContainer
}) {
  const jobDir = path.resolve(workRoot, jobId)
  const containerName = `codetogether-run-${jobId}`
  fs.mkdirSync(jobDir, { recursive: true })
  fs.writeFileSync(path.join(jobDir, FILE_NAMES[language]), code)

  return new Promise((resolve, reject) => {
    let child
    try {
      child = start(getDockerArgs(language, jobDir, containerName))
    } catch (error) {
      fs.rmSync(jobDir, { recursive: true, force: true })
      reject(error)
      return
    }
    let outputBytes = 0
    let timedOut = false
    let truncated = false
    let stopping = false

    const stop = () => {
      if (stopping) return
      stopping = true
      kill(containerName)
      child.kill()
    }
    onStart?.({ child, stop })

    const timer = setTimeout(() => {
      timedOut = true
      stop()
    }, timeoutMs)

    const forward = (chunk) => {
      if (truncated) return
      const room = maxOutputBytes - outputBytes
      if (chunk.length > room) {
        truncated = true
        if (room > 0) onOutput(chunk.subarray(0, room).toString())
        stop()
        return
      }
      outputBytes += chunk.length
      onOutput(chunk.toString())
    }
    child.stdout.on("data", forward)
    child.stderr.on("data", forward)
    // Writing to a program that has already exited is not an error worth
    // crashing over.
    child.stdin.on("error", () => {})

    let settled = false
    const finish = (fn) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fs.rmSync(jobDir, { recursive: true, force: true })
      fn()
    }

    child.on("error", (error) => finish(() => reject(error)))
    child.on("close", (exitCode) => finish(() => resolve({ exitCode, timedOut, truncated })))
  })
}
