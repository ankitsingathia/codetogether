// Joining, leaving, language and the shared document.
import { normalizeMemory, toClientMessages } from "../ai/memory.js"
import { LIMITS, isRoomId, isUsername } from "../limits.js"
import { defaultCode } from "../rooms.js"

// Socket.IO delivers binary as a Buffer on the server; Yjs wants a Uint8Array.
// Oversized messages are refused before Yjs parses them.
function toBytes(update) {
  const bytes = update instanceof Uint8Array ? update
    : update instanceof ArrayBuffer ? new Uint8Array(update)
      : null
  return bytes && bytes.length <= LIMITS.updateBytes ? bytes : null
}

const logFailure = (what) => (error) => console.error(`${what} failed:`, error?.message || error)

export function registerRoomHandlers(io, socket, { rooms, store, onLeave }) {
  // The room this socket joined, if it is that room and this server has it.
  const myRoom = (roomId) => (socket.data.roomId === roomId ? rooms.get(roomId) : undefined)

  async function sendAssistantHistory(roomId) {
    const memory = normalizeMemory(await store.getAssistant(roomId))
    socket.emit("assistant-history", { messages: toClientMessages(memory.recentTurns), summary: memory.summary })
  }

  async function isNameTaken(roomId, username) {
    const wanted = username.toLowerCase()
    return (await rooms.members(roomId)).some((m) => m.username.toLowerCase() === wanted)
  }

  async function leave() {
    const roomId = socket.data.roomId
    if (!roomId) return
    const room = rooms.get(roomId)
    const cursorRemoval = room ? rooms.removeCursors(room, socket.id) : null

    socket.data.roomId = undefined
    socket.data.username = undefined
    socket.leave(roomId)

    const members = await rooms.members(roomId)
    io.to(roomId).emit("members-update", members)
    if (cursorRemoval) io.to(roomId).emit("awareness-update", { update: cursorRemoval })
    await rooms.afterLeave(roomId, members.length)
  }

  socket.on("check-username", async ({ roomId, username } = {}) => {
    const valid = isRoomId(roomId) && isUsername(username)
    socket.emit("username-status", { available: valid && !(await isNameTaken(roomId, username)) })
  })

  socket.on("join-room", async ({ roomId, username } = {}) => {
    if (!isRoomId(roomId)) {
      socket.emit("join-error", { message: "Room IDs look like abc-defg-hij." })
      return
    }
    if (!isUsername(username)) {
      socket.emit("join-error", { message: "Names are 1-20 letters, numbers, spaces, dots, dashes or underscores." })
      return
    }

    try {
      // Joining again from the same socket just resends the room's state.
      const alreadyIn = socket.data.roomId === roomId
      if (!alreadyIn) {
        if (socket.data.roomId) await leave()
        if (await isNameTaken(roomId, username)) {
          socket.emit("join-error", { message: "Username already taken" })
          return
        }
      }

      const room = await rooms.open(roomId)
      if (!socket.connected) {
        // Left while the room was loading.
        await rooms.afterLeave(roomId, (await rooms.members(roomId)).length)
        return
      }

      socket.data.roomId = roomId
      socket.data.username ||= username
      socket.join(roomId)
      socket.emit("join-success", { roomId, username: socket.data.username })
      io.to(roomId).emit("members-update", await rooms.members(roomId))

      // The new member gets the whole document once, then only edits.
      socket.emit("language-changed", { language: room.language })
      socket.emit("yjs-update", { update: rooms.fullState(room) })
      const cursors = rooms.cursors(room)
      if (cursors) socket.emit("awareness-update", { update: cursors })

      await sendAssistantHistory(roomId)
    } catch (error) {
      logFailure("join")(error)
      socket.emit("join-error", { message: "Could not open the room. Try again in a moment." })
    }
  })

  socket.on("request-room-state", async ({ roomId } = {}) => {
    const room = myRoom(roomId)
    if (!room) {
      socket.emit("room-state", { success: false, message: "You are not in this room" })
      return
    }
    socket.emit("room-state", { success: true, roomId, members: await rooms.members(roomId), language: room.language })
    await sendAssistantHistory(roomId)
  })

  // An edit from one member: merge it here, pass it on to the room, then
  // record it and tell the other servers.
  socket.on("yjs-update", ({ roomId, update } = {}) => {
    const room = myRoom(roomId)
    const bytes = toBytes(update)
    if (!room || !bytes) return

    let saved
    try {
      saved = rooms.applyEdit(room, bytes, socket.id)
    } catch {
      return // not a valid Yjs update; drop it rather than relay or store it
    }
    socket.to(roomId).emit("yjs-update", { update: bytes })
    saved.catch(logFailure("saving an edit"))
  })

  socket.on("awareness-update", ({ roomId, update } = {}) => {
    const room = myRoom(roomId)
    const bytes = toBytes(update)
    if (!room || !bytes) return

    try {
      rooms.applyCursor(room, bytes, socket.id)
    } catch {
      return
    }
    socket.to(roomId).emit("awareness-update", { update: bytes })
  })

  socket.on("change-language", async ({ roomId, language } = {}) => {
    const room = myRoom(roomId)
    if (!room || !defaultCode(language) || language === room.language) return

    try {
      const update = await rooms.changeLanguage(room, language)
      io.to(roomId).emit("language-changed", { language })
      io.to(roomId).emit("yjs-update", { update })
    } catch (error) {
      logFailure("changing language")(error)
    }
  })

  socket.on("disconnect", () => {
    onLeave(socket.id)
    leave().catch(logFailure("leaving"))
  })
}
