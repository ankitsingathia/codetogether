// Runs real containers, so it is skipped unless RUN_DOCKER_TESTS=1. CI runs
// it in its own job on a runner that has Docker, with python:3 pulled first.
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { runJob } from "../src/execution/runner.js"

const skip = process.env.RUN_DOCKER_TESTS === "1" ? false : "set RUN_DOCKER_TESTS=1 to run"
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let workRoot
before(() => (workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codetogether-docker-"))))
after(() => fs.rmSync(workRoot, { recursive: true, force: true }))

function containerExists(name) {
  const out = execFileSync("docker", ["ps", "-aq", "--filter", `name=${name}`], { encoding: "utf8" })
  return out.trim() !== ""
}

function run(jobId, code, timeoutMs = 10_000) {
  let output = ""
  const result = runJob({
    jobId,
    language: "python",
    code,
    workRoot,
    timeoutMs,
    maxOutputBytes: 64 * 1024,
    onOutput: (chunk) => (output += chunk)
  })
  return result.then((r) => ({ ...r, output }))
}

test("a real container runs the code and prints its output", { skip }, async () => {
  const result = await run("hello", 'print("hello from docker")')
  assert.equal(result.exitCode, 0)
  assert.match(result.output, /hello from docker/)
})

test("a container that loops forever is gone after the time limit", { skip }, async () => {
  const result = await run("loop", "while True:\n    pass\n", 3000)
  assert.equal(result.timedOut, true)

  // Killing only the `docker run` client used to leave this container running.
  const deadline = Date.now() + 10_000
  while (containerExists("codetogether-run-loop")) {
    assert.ok(Date.now() < deadline, "the container is still running 10 s after the time limit")
    await sleep(250)
  }
})

test("the container has no network", { skip }, async () => {
  const result = await run(
    "network",
    [
      "import socket",
      "try:",
      "    socket.create_connection(('1.1.1.1', 53), timeout=2)",
      "    print('connected')",
      "except OSError:",
      "    print('no network')"
    ].join("\n")
  )
  assert.match(result.output, /no network/)
})
