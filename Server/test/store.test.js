// The same checks against both stores. The Redis one runs only when
// REDIS_URL is set (CI starts a Redis service for it).
import { describe, test, after } from "node:test"
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { Redis } from "ioredis"
import * as Y from "yjs"

import { createMemoryStore } from "../src/store/memory.js"
import { createRedisStore } from "../src/store/redis.js"

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const stores = [["memory", () => createMemoryStore()]]
if (process.env.REDIS_URL) stores.push(["redis", () => createRedisStore(new Redis(process.env.REDIS_URL))])

function textOf(updates) {
  const doc = new Y.Doc()
  for (const update of updates) Y.applyUpdate(doc, update)
  return doc.getText("code").toString()
}

function seed(text) {
  const doc = new Y.Doc()
  doc.getText("code").insert(0, text)
  return { doc, update: Y.encodeStateAsUpdate(doc) }
}

for (const [name, create] of stores) {
  describe(`${name} store`, () => {
    const store = create()
    const room = () => `test-${randomUUID().slice(0, 8)}`
    after(() => store.close())

    test("creates a room only once, even if asked twice", async () => {
      const id = room()
      assert.equal(await store.initRoom(id, seed("first").update, "java"), true)
      assert.equal(await store.initRoom(id, seed("second").update, "python"), false)

      const loaded = await store.loadRoom(id)
      assert.equal(loaded.language, "java")
      assert.equal(textOf(loaded.updates), "first")
    })

    test("an unknown room loads as null", async () => {
      assert.equal(await store.loadRoom(room()), null)
    })

    test("a long edit log is compacted without losing any text", async () => {
      const id = room()
      const { doc, update } = seed("")
      await store.initRoom(id, update, "python")

      let expected = ""
      for (let i = 0; i < 260; i++) {
        const before = Y.encodeStateVector(doc)
        doc.getText("code").insert(doc.getText("code").length, String(i % 10))
        expected += String(i % 10)
        await store.appendUpdate(id, Y.encodeStateAsUpdate(doc, before))
      }

      const loaded = await store.loadRoom(id)
      assert.equal(textOf(loaded.updates), expected)
      assert.ok(loaded.updates.length < 100, `expected a compacted log, got ${loaded.updates.length} entries`)
    })

    test("only one socket holds the run lock, and only it can release it", async () => {
      const id = room()
      await store.initRoom(id, seed("x").update, "java")

      assert.equal(await store.acquireRunLock(id, "socket-a", 5000), true)
      assert.equal(await store.acquireRunLock(id, "socket-b", 5000), false)

      await store.releaseRunLock(id, "socket-b") // not the holder: no effect
      assert.equal(await store.acquireRunLock(id, "socket-b", 5000), false)

      await store.releaseRunLock(id, "socket-a")
      assert.equal(await store.acquireRunLock(id, "socket-b", 5000), true)
    })

    test("a run lock left by a crashed server expires", async () => {
      const id = room()
      await store.initRoom(id, seed("x").update, "java")
      assert.equal(await store.acquireRunLock(id, "socket-a", 100), true)
      await sleep(250)
      assert.equal(await store.acquireRunLock(id, "socket-b", 5000), true)
    })

    test("deleting a room removes its log, language and assistant memory", async () => {
      const id = room()
      await store.initRoom(id, seed("x").update, "java")
      await store.setAssistant(id, { summary: "s", recentTurns: [] })
      assert.equal((await store.getAssistant(id)).summary, "s")

      await store.deleteRoom(id)
      assert.equal(await store.loadRoom(id), null)
      assert.equal(await store.getAssistant(id), null)
    })
  })
}

describe("messages between servers", () => {
  test("a Yjs update survives the JSON trip through the Redis adapter", async () => {
    const { toWire, fromWire } = await import("../src/rooms.js")
    const update = seed("héllo, wörld").update

    // What the adapter does to a server-side emit: JSON out, JSON back in.
    const [received] = JSON.parse(JSON.stringify([toWire(update)]))
    assert.equal(textOf([fromWire(received)]), "héllo, wörld")

    // A raw Uint8Array would not survive it, which is why the wire format exists.
    const [raw] = JSON.parse(JSON.stringify([update]))
    assert.equal(raw instanceof Uint8Array, false)
  })

  test("anything that isn't base64 text is refused", async () => {
    const { fromWire } = await import("../src/rooms.js")
    assert.equal(fromWire({ 0: 1, 1: 2 }), null)
    assert.equal(fromWire(""), null)
    assert.equal(fromWire(undefined), null)
  })
})
