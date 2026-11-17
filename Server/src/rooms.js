// Rooms: the shared document, who is in the room, and keeping several
// server instances in step.
//
// The code lives in a Yjs document (a CRDT). Clients send the small edits they
// made, not the whole file, and every copy of the document merges the same set
// of edits into the same text whatever order they arrive in. That is what lets
// two people type at the same time without overwriting each other, and it is
// also what makes running several servers simple: each server keeps its own
// copy, edits are passed between servers, and all copies converge.
//
// Where things live:
//   - the edit log, language, run lock and assistant memory: the store
//     (in memory for one server, Redis for several)
//   - a working copy of the document: on each server that has a member of the
//     room connected, dropped when its last local member leaves
//   - who is in the room: Socket.IO itself, asked across all servers
import * as Y from "yjs"
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from "y-protocols/awareness"

const TEMPLATES = {
  java: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, World!");
  }
}`,
  python: `print("Hello, World!")`,
  cpp: `#include <iostream>
int main() {
  std::cout << "Hello, World!";
}`
}

export const LANGUAGES = Object.keys(TEMPLATES)
export const defaultCode = (language) => TEMPLATES[language]

// Origin for changes that came from another server, so they aren't passed on
// again. An object, so it can't be mistaken for a socket id.
const PEER = Object.freeze({ peer: true })

const toBytes = (value) =>
  value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null

export function createRooms({ io, store, cluster }) {
  const ready = new Map() // roomId -> room, for rooms this server has loaded
  const loading = new Map() // roomId -> Promise<room>
  const early = new Map() // roomId -> peer messages that arrived while loading

  const toPeers = (event, ...args) => {
    if (cluster) io.serverSideEmit(event, ...args)
  }

  function build(roomId, { language, updates }) {
    const doc = new Y.Doc()
    for (const update of updates) Y.applyUpdate(doc, update, PEER)

    // Awareness carries who is in the document and where their cursor is. It
    // is not part of the text, and entries expire if a client stops renewing.
    const awareness = new Awareness(doc)
    awareness.setLocalState(null) // the server has no cursor of its own

    // Which local socket owns which awareness client, so a socket that drops
    // can have its cursor removed for everyone.
    const awarenessOwners = new Map()
    awareness.on("update", ({ added }, origin) => {
      if (typeof origin === "string") for (const id of added) awarenessOwners.set(id, origin)
    })

    return { roomId, doc, awareness, awarenessOwners, language }
  }

  async function load(roomId) {
    let state = await store.loadRoom(roomId)
    if (!state) {
      // A new room. initRoom refuses if another server created it first, in
      // which case we load theirs.
      const seed = new Y.Doc()
      seed.getText("code").insert(0, defaultCode("java"))
      await store.initRoom(roomId, Y.encodeStateAsUpdate(seed), "java")
      seed.destroy()
      state = await store.loadRoom(roomId)
    }

    const room = build(roomId, state)
    for (const apply of early.get(roomId) || []) apply(room)
    early.delete(roomId)
    ready.set(roomId, room)
    return room
  }

  // Messages from other servers. If this server is still loading the room,
  // they are held and applied once it is ready, so none are missed.
  function fromPeer(roomId, apply) {
    const room = ready.get(roomId)
    if (room) return apply(room)
    if (loading.has(roomId)) early.set(roomId, [...(early.get(roomId) || []), apply])
  }

  if (cluster) {
    io.on("ct:yjs", (roomId, update) => {
      const bytes = toBytes(update)
      if (bytes) fromPeer(roomId, (room) => Y.applyUpdate(room.doc, bytes, PEER))
    })
    io.on("ct:awareness", (roomId, update) => {
      const bytes = toBytes(update)
      if (bytes) fromPeer(roomId, (room) => applyAwarenessUpdate(room.awareness, bytes, PEER))
    })
    io.on("ct:language", (roomId, language) => {
      fromPeer(roomId, (room) => (room.language = language))
    })
  }

  return {
    get: (roomId) => ready.get(roomId),

    async open(roomId) {
      if (ready.has(roomId)) return ready.get(roomId)
      if (!loading.has(roomId)) {
        loading.set(roomId, load(roomId).finally(() => loading.delete(roomId)))
      }
      return loading.get(roomId)
    },

    codeOf: (room) => room.doc.getText("code").toString(),
    fullState: (room) => Y.encodeStateAsUpdate(room.doc),

    // An edit from a member. Merges it here straight away and throws if it
    // isn't a valid Yjs update, so nothing malformed is ever stored. Returns a
    // promise for recording it and passing it to the other servers, so the
    // caller can relay it to clients without waiting for Redis.
    applyEdit(room, update, socketId) {
      Y.applyUpdate(room.doc, update, socketId)
      return store.appendUpdate(room.roomId, update).then(() => toPeers("ct:yjs", room.roomId, update))
    },

    // Replaces the whole text with the new language's template. Returns the
    // update to send to every member.
    async changeLanguage(room, language) {
      const before = Y.encodeStateVector(room.doc)
      const text = room.doc.getText("code")
      room.doc.transact(() => {
        text.delete(0, text.length)
        text.insert(0, defaultCode(language))
      }, PEER)
      const update = Y.encodeStateAsUpdate(room.doc, before)
      room.language = language

      await store.setLanguage(room.roomId, language)
      await store.appendUpdate(room.roomId, update)
      toPeers("ct:yjs", room.roomId, update)
      toPeers("ct:language", room.roomId, language)
      return update
    },

    cursors(room) {
      const ids = [...room.awareness.getStates().keys()]
      return ids.length ? encodeAwarenessUpdate(room.awareness, ids) : null
    },

    applyCursor(room, update, socketId) {
      applyAwarenessUpdate(room.awareness, update, socketId)
      toPeers("ct:awareness", room.roomId, update)
    },

    // Removes a socket's cursors. Returns the update to send to the room, or
    // null if it had none.
    removeCursors(room, socketId) {
      const ids = [...room.awarenessOwners].filter(([, owner]) => owner === socketId).map(([id]) => id)
      if (!ids.length) return null
      for (const id of ids) room.awarenessOwners.delete(id)
      removeAwarenessStates(room.awareness, ids, PEER)
      const update = encodeAwarenessUpdate(room.awareness, ids)
      toPeers("ct:awareness", room.roomId, update)
      return update
    },

    // Everyone in the room, on every server.
    async members(roomId) {
      const sockets = await io.in(roomId).fetchSockets()
      return sockets
        .filter((s) => s.data?.roomId === roomId && s.data.username)
        .map((s) => ({ socketId: s.id, username: s.data.username }))
    },

    // Called after a member leaves. Drops this server's copy if none of its
    // own sockets are left in the room, and deletes the room everywhere once
    // nobody is left on any server.
    async afterLeave(roomId, remaining) {
      const localSockets = io.of("/").adapter.rooms.get(roomId)?.size || 0
      if (!localSockets) {
        const room = ready.get(roomId)
        if (room) {
          room.awareness.destroy()
          room.doc.destroy()
          ready.delete(roomId)
        }
      }
      if (remaining === 0) await store.deleteRoom(roomId)
    }
  }
}
