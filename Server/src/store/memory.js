// Room state kept in this process. Used when REDIS_URL is not set: one
// server, nothing shared. Same interface as the Redis store, so the rest of
// the server doesn't know which one it has.
import * as Y from "yjs"

const COMPACT_AT = 200

export function createMemoryStore() {
  const rooms = new Map() // roomId -> { updates, language, run, assistant }

  return {
    kind: "memory",

    async initRoom(roomId, initialUpdate, language) {
      if (rooms.has(roomId)) return false
      rooms.set(roomId, { updates: [initialUpdate], language, run: null, assistant: null })
      return true
    },

    async loadRoom(roomId) {
      const room = rooms.get(roomId)
      return room ? { updates: [...room.updates], language: room.language } : null
    },

    async appendUpdate(roomId, update) {
      const room = rooms.get(roomId)
      if (!room) return
      room.updates.push(update)
      if (room.updates.length > COMPACT_AT) room.updates = [Y.mergeUpdates(room.updates)]
    },

    async setLanguage(roomId, language) {
      const room = rooms.get(roomId)
      if (room) room.language = language
    },

    async acquireRunLock(roomId, owner, ttlMs) {
      const room = rooms.get(roomId)
      if (!room) return false
      if (room.run && room.run.expires > Date.now()) return false
      room.run = { owner, expires: Date.now() + ttlMs }
      return true
    },

    async releaseRunLock(roomId, owner) {
      const room = rooms.get(roomId)
      if (room?.run?.owner === owner) room.run = null
    },

    async getAssistant(roomId) {
      return rooms.get(roomId)?.assistant ?? null
    },

    async setAssistant(roomId, value) {
      const room = rooms.get(roomId)
      if (room) room.assistant = structuredClone(value)
    },

    async deleteRoom(roomId) {
      rooms.delete(roomId)
    },

    async close() {}
  }
}
