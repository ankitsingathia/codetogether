import { io } from "socket.io-client"


let socket = null

export function connectSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL)

    socket.on("connect", () => {
      console.log("Socket connected:", socket.id)
    })

    socket.on("disconnect", () => {
      console.log("Socket disconnected")
    })
  }

  return socket
}


function ensureSocket() {
  if (!socket) {
    throw new Error("Socket not initialized. Call connectSocket() first.")
  }
}

export function checkUsername(roomId, username) {
  ensureSocket()
  return new Promise((resolve) => {
    socket.emit("check-username", { roomId, username })
    socket.once("username-status", ({ available }) => resolve(available))
  })
}

export function joinRoom(roomId, username) {
  socket.emit("join-room", { roomId, username })
}

export function onJoinError(callback) {
  socket.once("join-error", callback)
}

export function offJoinError() {
  socket.off("join-error")
}

export function onJoinSuccess(cb) {
  socket.once("join-success", cb)
}


export function onMembersUpdate(cb) {
  socket.off("members-update")
  socket.on("members-update", cb)
}

export function requestRoomState(roomId) {
  ensureSocket()
  socket.emit("request-room-state", { roomId })
}

export function onRoomState(cb) {
  socket.off("room-state")
  socket.on("room-state", cb)
}

export function runCode(roomId) {
  if (!socket || !socket.connected) {
    console.warn("Socket not connected")
    return false
  }
  socket.emit("run-code", { roomId })
  return true
}

export function executionStarted(cb) {
  socket.off("execution-started")
  socket.on("execution-started", cb)
}

export function executionEnded(cb) {
  socket.off("execution-ended")
  socket.on("execution-ended", cb)
}

// The server refused a run (already running, too long, too many runs).
export function onRunDenied(cb) {
  socket.off("run-denied")
  socket.on("run-denied", cb)
}

// The run is waiting for a free slot on the server.
export function onExecutionQueued(cb) {
  socket.off("execution-queued")
  socket.on("execution-queued", cb)
}

export function onProgramOutput(callback) {
  socket.on("program-output", callback)
}

export function onLanguageChanged(cb) {
  socket.off("language-changed")
  socket.on("language-changed", cb)
}

export function sendProgramInput(roomId, input) {
  socket.emit("program-input", { roomId, input })
}

export function changeLanguage(roomId, language) {
  socket.emit("change-language", { roomId, language })
}

// Gemini Code Review Functions
export function reviewCode(roomId) {
  if (!socket || !socket.connected) {
    console.warn("Socket not connected")
    return false
  }
  socket.emit("review-code", { roomId })
  return true
}

export function onReviewStarted(cb) {
  socket.off("review-started")
  socket.on("review-started", cb)
}

export function onReviewResult(cb) {
  socket.off("review-result")
  socket.on("review-result", cb)
}

export function askCodingAssistant(roomId, question) {
  if (!socket || !socket.connected) {
    console.warn("Socket not connected")
    return false
  }
  socket.emit("assistant-query", { roomId, question })
  return true
}

export function onAssistantStarted(cb) {
  socket.off("assistant-started")
  socket.on("assistant-started", cb)
}

export function onAssistantResult(cb) {
  socket.off("assistant-result")
  socket.on("assistant-result", cb)
}

export function onAssistantHistory(cb) {
  socket.off("assistant-history")
  socket.on("assistant-history", cb)
}

export function disconnectSocket() {
  if (socket) {
    socket.off("room-state")
    socket.off("language-changed")
    socket.off("program-output")
    socket.off("run-denied")
    socket.off("execution-queued")
    socket.off("execution-started")
    socket.off("execution-ended")
    socket.off("review-started")
    socket.off("review-result")
    socket.off("assistant-started")
    socket.off("assistant-result")
    socket.off("assistant-history")
    socket.disconnect()
    socket = null
  }
}
