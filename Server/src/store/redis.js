// Room state in Redis, shared by every server instance.
//
//   ct:room:<id>:updates    list of Yjs updates, oldest first (binary)
//   ct:room:<id>:meta       hash: language
//   ct:room:<id>:run        who holds the run lock (expires on its own)
//   ct:room:<id>:assistant  the assistant's memory, JSON
//
// The document is stored as its edit log, not as text. Any server can rebuild
// it by applying the log, and applying an edit twice is harmless in Yjs, so
// servers never need to agree on an order. The log is folded into a single
// update once it grows, so it stays small.
import * as Y from "yjs"

const COMPACT_AT = 200
const ROOM_TTL_S = 24 * 60 * 60 // safety net if a server dies without cleaning up

const keys = (roomId) => ({
  updates: `ct:room:${roomId}:updates`,
  meta: `ct:room:${roomId}:meta`,
  run: `ct:room:${roomId}:run`,
  assistant: `ct:room:${roomId}:assistant`,
  compacting: `ct:room:${roomId}:compacting`
})

// Creates the room only if it doesn't exist yet. Two servers creating the
// same new room at the same moment would otherwise both insert the starter
// template, and the room would start with it twice.
const INIT_ROOM = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'language', ARGV[1])
redis.call('RPUSH', KEYS[2], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1`

// Releases the run lock only if this socket still holds it.
const RELEASE_IF_OWNER = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`

export function createRedisStore(redis) {
  async function compact(roomId) {
    const k = keys(roomId)
    // One compactor at a time. Others only ever append to the tail, so the
    // first `count` entries can't change while this one works on them.
    const locked = await redis.set(k.compacting, "1", "PX", 10_000, "NX")
    if (!locked) return
    try {
      const head = await redis.lrangeBuffer(k.updates, 0, COMPACT_AT - 1)
      if (head.length < 2) return
      const merged = Buffer.from(Y.mergeUpdates(head.map((b) => new Uint8Array(b))))
      await redis.multi().ltrim(k.updates, head.length, -1).lpush(k.updates, merged).exec()
    } finally {
      await redis.del(k.compacting)
    }
  }

  return {
    kind: "redis",

    async initRoom(roomId, initialUpdate, language) {
      const k = keys(roomId)
      const created = await redis.eval(INIT_ROOM, 2, k.meta, k.updates, language, Buffer.from(initialUpdate), ROOM_TTL_S)
      return created === 1
    },

    async loadRoom(roomId) {
      const k = keys(roomId)
      const [[, language], [, updates]] = await redis.multi().hget(k.meta, "language").lrangeBuffer(k.updates, 0, -1).exec()
      if (!language) return null
      return { language, updates: updates.map((b) => new Uint8Array(b)) }
    },

    async appendUpdate(roomId, update) {
      const k = keys(roomId)
      const [[, length]] = await redis.multi()
        .rpush(k.updates, Buffer.from(update))
        .expire(k.updates, ROOM_TTL_S)
        .expire(k.meta, ROOM_TTL_S)
        .exec()
      if (length > COMPACT_AT) await compact(roomId)
    },

    async setLanguage(roomId, language) {
      await redis.hset(keys(roomId).meta, "language", language)
    },

    async acquireRunLock(roomId, owner, ttlMs) {
      return (await redis.set(keys(roomId).run, owner, "PX", ttlMs, "NX")) === "OK"
    },

    async releaseRunLock(roomId, owner) {
      await redis.eval(RELEASE_IF_OWNER, 1, keys(roomId).run, owner)
    },

    async getAssistant(roomId) {
      const raw = await redis.get(keys(roomId).assistant)
      return raw ? JSON.parse(raw) : null
    },

    async setAssistant(roomId, value) {
      await redis.set(keys(roomId).assistant, JSON.stringify(value), "EX", ROOM_TTL_S)
    },

    async deleteRoom(roomId) {
      const k = keys(roomId)
      await redis.del(k.updates, k.meta, k.run, k.assistant)
    },

    async close() {
      await redis.quit()
    }
  }
}
