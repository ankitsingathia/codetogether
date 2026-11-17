// Joining, leaving, language and the shared document.
import { saveMemory, toClientMessages } from "../ai/memory.js"
import {
  assistantMemory, defaultCode, getOrCreateRoom, getRoom, isMember, isNameTaken, leaveAll
} from "../rooms.js"

function sendAssistantHistory(socket, room) {
  const memory = assistantMemory(room)
  socket.emit("assistant-history", {
    messages: toClientMessages(memory.recentTurns),
    summary: memory.summary
  })
}

export function registerRoomHandlers(io, socket, { onLeave }) {
  socket.on("check-username", ({ roomId, username }) => {
    socket.emit("username-status", { available: !isNameTaken(getRoom(roomId), username) })
  })

  socket.on("join-room", ({ roomId, username }) => {
    const room = getOrCreateRoom(roomId)

    if (isNameTaken(room, username)) {
      socket.emit("join-error", { message: "Username already taken" })
      return
    }

    room.users.push({ socketId: socket.id, username })
    socket.join(roomId)
    socket.emit("join-success", { roomId, username })

    io.to(roomId).emit("members-update", room.users)
    socket.emit("sync-code", { code: room.code, language: room.language })

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

    socket.emit("room-state", {
      success: true,
      roomId,
      members: room.users,
      code: room.code,
      language: room.language
    })
    sendAssistantHistory(socket, room)
  })

  socket.on("code-change", ({ roomId, code }) => {
    const room = getRoom(roomId)
    if (!room) return

    room.code = code
    socket.to(roomId).emit("code-change", { code })
  })

  socket.on("change-language", ({ roomId, language }) => {
    const room = getRoom(roomId)
    if (!room) return

    room.language = language
    room.code = defaultCode(language)
    io.to(roomId).emit("language-changed", { language, code: room.code })
  })

  socket.on("disconnect", () => {
    onLeave(socket.id)
    for (const room of leaveAll(socket.id)) {
      io.to(room.roomId).emit("members-update", room.users)
    }
  })
}
