// The run pipeline without Docker: a plain Node process stands in for the
// container, and the kill function records which container it was asked to
// stop.
import { test, describe, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { getDockerArgs } from "../src/execution/dockerCommand.js"
import { JobQueue, QueueFullError } from "../src/execution/queue.js"
import { runJob } from "../src/execution/runner.js"
import { isRoomId, isUsername, rateLimiter } from "../src/limits.js"

let workRoot
before(() => (workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codetogether-jobs-"))))
after(() => fs.rmSync(workRoot, { recursive: true, force: true }))

// Runs `script` with Node in place of `docker run ...`.
function fakeDocker(script) {
  const killed = []
  return {
    killed,
    start: () => spawn(process.execPath, ["-e", script], { stdio: ["pipe", "pipe", "pipe"] }),
    kill: async (name) => killed.push(name)
  }
}

function run(script, overrides = {}) {
  const docker = fakeDocker(script)
  let output = ""
  const result = runJob({
    jobId: overrides.jobId || "job1",
    language: "python",
    code: "print(1)",
    workRoot,
    timeoutMs: 1000,
    maxOutputBytes: 1024,
    onOutput: (chunk) => (output += chunk),
    start: docker.start,
    kill: docker.kill,
    ...overrides
  })
  return { result, docker, output: () => output }
}

describe("docker arguments", () => {
  test("name the container and lock it down, with no shell in between", () => {
    const args = getDockerArgs("python", "/tmp/job", "codetogether-run-abc")
    const joined = args.join(" ")
    assert.match(joined, /--name codetogether-run-abc/)
    assert.match(joined, /--network none/)
    assert.match(joined, /--pids-limit=64/)
    assert.match(joined, /no-new-privileges/)
    assert.equal(args[0], "run")
  })

  test("refuse a language that isn't supported", () => {
    assert.throws(() => getDockerArgs("rust", "/tmp/job", "x"), /Unsupported language/)
  })
})

describe("runner", () => {
  test("passes output through and removes the job folder", async () => {
    const job = run("console.log('hello')", { jobId: "ok" })
    const result = await job.result
    assert.equal(result.exitCode, 0)
    assert.equal(result.timedOut, false)
    assert.equal(job.output().trim(), "hello")
    assert.equal(fs.existsSync(path.join(workRoot, "ok")), false)
  })

  test("writes the code to the file the image expects and mounts that folder", async () => {
    let seen
    await runJob({
      jobId: "files",
      language: "java",
      code: "class Main {}",
      workRoot,
      timeoutMs: 1000,
      maxOutputBytes: 1024,
      onOutput: () => {},
      start: (args) => {
        const jobDir = path.join(workRoot, "files")
        seen = {
          code: fs.readFileSync(path.join(jobDir, "Main.java"), "utf8"),
          mounted: args.includes(`${path.resolve(jobDir)}:/app`)
        }
        return spawn(process.execPath, ["-e", ""], { stdio: ["pipe", "pipe", "pipe"] })
      },
      kill: async () => {}
    })
    assert.deepEqual(seen, { code: "class Main {}", mounted: true })
  })

  test("a program that never ends is stopped, and the container is killed by name", async () => {
    const started = Date.now()
    const job = run("setInterval(() => {}, 1000)", { jobId: "loop", timeoutMs: 300 })
    const result = await job.result

    assert.equal(result.timedOut, true)
    assert.deepEqual(job.docker.killed, ["codetogether-run-loop"])
    assert.ok(Date.now() - started < 3000, "should stop soon after the time limit")
  })

  test("a program that prints too much is cut off and stopped", async () => {
    const job = run("const line = 'x'.repeat(100) + '\\n'; setInterval(() => process.stdout.write(line.repeat(50)), 1)", {
      jobId: "flood",
      maxOutputBytes: 1024
    })
    const result = await job.result

    assert.equal(result.truncated, true)
    assert.ok(job.output().length <= 1024)
    assert.deepEqual(job.docker.killed, ["codetogether-run-flood"])
  })

  test("a container that can't start is reported, and the folder is removed", async () => {
    const missing = Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" })
    const result = runJob({
      jobId: "nodocker",
      language: "python",
      code: "print(1)",
      workRoot,
      timeoutMs: 1000,
      maxOutputBytes: 1024,
      onOutput: () => {},
      start: () => {
        throw missing
      }
    })
    await assert.rejects(result, /ENOENT/)
    assert.equal(fs.existsSync(path.join(workRoot, "nodocker")), false)
  })
})

describe("job queue", () => {
  const deferred = () => {
    let resolve
    const promise = new Promise((r) => (resolve = r))
    return { promise, resolve }
  }

  test("never runs more than `concurrency` jobs at once, and starts them in order", async () => {
    const queue = new JobQueue({ concurrency: 2, maxWaiting: 10 })
    let running = 0
    let peak = 0
    const started = []

    const jobs = [1, 2, 3, 4, 5].map((n) => queue.add({
      run: async () => {
        started.push(n)
        peak = Math.max(peak, ++running)
        await new Promise((r) => setTimeout(r, 20))
        running--
        return n
      }
    }))

    assert.deepEqual(await Promise.all(jobs), [1, 2, 3, 4, 5])
    assert.equal(peak, 2)
    assert.deepEqual(started, [1, 2, 3, 4, 5])
  })

  test("tells waiting jobs their place in line", async () => {
    const queue = new JobQueue({ concurrency: 1, maxWaiting: 10 })
    const blocker = deferred()
    const positions = []

    const first = queue.add({ run: () => blocker.promise })
    const second = queue.add({ run: async () => "done", onPosition: (p) => positions.push(p) })
    assert.deepEqual(positions, [1])

    blocker.resolve()
    await Promise.all([first, second])
    assert.deepEqual(positions, [1]) // not repeated after it started
  })

  test("a job that starts straight away is never told it is waiting", async () => {
    const queue = new JobQueue({ concurrency: 1, maxWaiting: 10 })
    const positions = []
    await queue.add({ run: async () => {}, onPosition: (p) => positions.push(p) })
    assert.deepEqual(positions, [])
  })

  test("refuses new jobs once the waiting line is full", async () => {
    const queue = new JobQueue({ concurrency: 1, maxWaiting: 1 })
    const blocker = deferred()
    const first = queue.add({ run: () => blocker.promise })
    const second = queue.add({ run: async () => {} })

    assert.throws(() => queue.add({ run: async () => {} }), QueueFullError)

    blocker.resolve()
    await Promise.all([first, second])
  })

  test("a waiting job can be cancelled; a running one cannot", async () => {
    const queue = new JobQueue({ concurrency: 1, maxWaiting: 5 })
    const blocker = deferred()
    const runningJob = { run: () => blocker.promise }
    const waitingJob = { run: async () => "should not run" }

    const first = queue.add(runningJob)
    const second = queue.add(waitingJob)

    assert.equal(queue.cancel(waitingJob), true)
    await assert.rejects(second, /Cancelled/)
    assert.equal(queue.cancel(runningJob), false)

    blocker.resolve()
    await first
    assert.deepEqual(queue.size, { running: 0, waiting: 0 })
  })

  test("a failing job doesn't stall the ones behind it", async () => {
    const queue = new JobQueue({ concurrency: 1, maxWaiting: 5 })
    const failed = queue.add({ run: async () => { throw new Error("boom") } })
    const next = queue.add({ run: async () => "still runs" })

    await assert.rejects(failed, /boom/)
    assert.equal(await next, "still runs")
  })
})

describe("limits", () => {
  test("room ids must match the format the client generates", () => {
    assert.equal(isRoomId("a1b-c2d3-e4f"), true)
    assert.equal(isRoomId("../../etc"), false)
    assert.equal(isRoomId("room-1"), false)
    assert.equal(isRoomId(42), false)
  })

  test("names are short and plain", () => {
    assert.equal(isUsername("Ankit S"), true)
    assert.equal(isUsername("अंकित"), true)
    assert.equal(isUsername(""), false)
    assert.equal(isUsername(" padded "), false)
    assert.equal(isUsername("<script>"), false)
    assert.equal(isUsername("x".repeat(21)), false)
  })

  test("the rate limiter allows `max` events per window per key", () => {
    let now = 0
    const limiter = rateLimiter({ max: 2, windowMs: 1000, now: () => now })

    assert.equal(limiter.take("a"), 0)
    assert.equal(limiter.take("a"), 0)
    assert.equal(limiter.take("a"), 1000) // third in the same second
    assert.equal(limiter.take("b"), 0) // other keys have their own budget

    now = 600
    assert.equal(limiter.take("a"), 400) // the first event expires at 1000
    now = 1000
    assert.equal(limiter.take("a"), 0)
  })
})
