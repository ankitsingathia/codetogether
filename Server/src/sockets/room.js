// Joining, leaving, language and the shared document.
import * as Y from "yjs"
import { applyAwarenessUpdate, encodeAwarenessUpdate } from "y-protocols/awareness"

import { saveMemory, toClientMessages } from "../ai/memory.js"
import {
  assistantMemory, defaultCode, fullState, getOrCreateRoom, getRoom, isMember, isNameTaken,
  leaveAll, replaceCode
} from "../rooms.js"

function sendAssistantHistory(socket, room) {
  const memory = assistantMemory(room)
  socket.emit("assistant-history", {
    messages: toClientMessages(memory.recentTurns),
    summary: memory.summary
  })
}

// Socket.IO delivers binary as a Buffer on the server; Yjs wants a Uint8Array.
function toBytes(update) {
  if (update instanceof Uint8Array) return update
  if (update instanceof ArrayBuffer) return new Uint8Array(update)
  return null
}

export function registerRoomHandlers(io, socket, { onLeave }) {
  socket.on("check-username", ({ roomId, username }) => {
    socket.emit("username-status", { available: !isNameTaken(getRoom(roomId), username) })
  })

  socket.on("join-room", ({ roomId, username }) => {
    const room = getOrCreateRoom(roomId)
    const alreadyIn = isMember(room, socket.id)

    if (!alreadyIn && isNameTaken(room, username)) {
      socket.emit("join-error", { message: "Username already taken" })
      return
    }

    // Joining again from the same socket just resends the room's state.
    if (!alreadyIn) room.users.push({ socketId: socket.id, username })
    socket.join(roomId)
    socket.emit("join-success", { roomId, username })
    io.to(roomId).emit("members-update", room.users)

    // The new member gets the whole document once, then only edits.
    socket.emit("language-changed", { language: room.language })
    socket.emit("yjs-update", { update: fullState(room) })
    const cursors = [...room.awareness.getStates().keys()]
    if (cursors.length) {
      socket.emit("awareness-update", { update: encodeAwarenessUpdate(room.awareness, cursors) })
    }

    saveMemory(roomId, assistantMemory(room))
    sendAssistantHistory(socket, room)
  })

  socket.on("request-room-state", ({ roomId }) => {
    const room = getRoom(roomId)
    if (!room) {
      socket.emit("room-state", { success: false, message: "Room not found" })
      return
    }
    if (!isMember(room, socket.id)) {
      socket.emit("room-state", { success: false, message: "You are not in this room" })
      return
    }

    socket.emit("room-state", { success: true, roomId, members: room.users, language: room.language })
    sendAssistantHistory(socket, room)
  })

  // An edit from one member: merge it into the room's copy and pass it on.
  socket.on("yjs-update", ({ roomId, update }) => {
    const room = getRoom(roomId)
    const bytes = toBytes(update)
    if (!room || !bytes || !isMember(room, socket.id)) return

    try {
      Y.applyUpdate(room.doc, bytes, socket.id)
    } catch {
      return // not a valid Yjs update; drop it rather than relay it
    }
    socket.to(roomId).emit("yjs-update", { update: bytes })
  })

  socket.on("awareness-update", ({ roomId, update }) => {
    const room = getRoom(roomId)
    const bytes = toBytes(update)
    if (!room || !bytes || !isMember(room, socket.id)) return

    try {
      applyAwarenessUpdate(room.awareness, bytes, socket.id)
    } catch {
      return
    }
    socket.to(roomId).emit("awareness-update", { update: bytes })
  })

  socket.on("change-language", ({ roomId, language }) => {
    const room = getRoom(roomId)
    if (!room || !isMember(room, socket.id) || !defaultCode(language)) return

    room.language = language
    const update = replaceCode(room, defaultCode(language))
    io.to(roomId).emit("language-changed", { language })
    io.to(roomId).emit("yjs-update", { update })
  })

  socket.on("disconnect", () => {
    onLeave(socket.id)
    for (const { room, awarenessIds } of leaveAll(socket.id)) {
      io.to(room.roomId).emit("members-update", room.users)
      if (awarenessIds.length) {
        io.to(room.roomId).emit("awareness-update", {
          update: encodeAwarenessUpdate(room.awareness, awarenessIds)
        })
      }
    }
  })
}
