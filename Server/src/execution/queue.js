// A small job queue: at most `concurrency` jobs run at once, the rest wait in
// arrival order, and once `maxWaiting` jobs are waiting new ones are refused.
//
// Containers are the expensive part of the server. Without a queue, every room
// pressing Run at once starts a JVM each, and the machine runs out of memory
// for all of them instead of slowing down for some.
export class QueueFullError extends Error {
  constructor() {
    super("The server is busy. Please try again in a moment.")
    this.name = "QueueFullError"
  }
}

export class JobQueue {
  constructor({ concurrency = 2, maxWaiting = 20 } = {}) {
    this.concurrency = concurrency
    this.maxWaiting = maxWaiting
    this.running = 0
    this.waiting = []
  }

  /**
   * Adds a job. `job.run()` returns a promise; `job.onPosition(n)` (optional)
   * is told its place in line while it waits (1 = next). Returns a promise
   * that settles with the job's result. Throws QueueFullError when full.
   */
  add(job) {
    if (this.running >= this.concurrency && this.waiting.length >= this.maxWaiting) {
      throw new QueueFullError()
    }
    return new Promise((resolve, reject) => {
      this.waiting.push({ job, resolve, reject, position: 0 })
      this.#startNext()
      this.#announcePositions()
    })
  }

  /** Removes a job that hasn't started yet. Returns true if it was waiting. */
  cancel(job) {
    const index = this.waiting.findIndex((entry) => entry.job === job)
    if (index === -1) return false
    const [entry] = this.waiting.splice(index, 1)
    entry.reject(new Error("Cancelled"))
    this.#announcePositions()
    return true
  }

  get size() {
    return { running: this.running, waiting: this.waiting.length }
  }

  #startNext() {
    while (this.running < this.concurrency && this.waiting.length) {
      const { job, resolve, reject } = this.waiting.shift()
      this.running++
      // The slot is freed before the caller hears the result, so by then the
      // queue's counts are already up to date.
      const done = (settle) => (value) => {
        this.running--
        this.#startNext()
        settle(value)
      }
      this.#announcePositions()
      Promise.resolve()
        .then(() => job.run())
        .then(done(resolve), done(reject))
    }
  }

  // Tells each waiting job its place in line, only when it has changed.
  #announcePositions() {
    this.waiting.forEach((entry, index) => {
      if (entry.position === index + 1) return
      entry.position = index + 1
      entry.job.onPosition?.(entry.position)
    })
  }
}
