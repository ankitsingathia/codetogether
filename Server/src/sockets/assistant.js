// AI review and the room's coding assistant.
import { buildAssistantPrompt, generate, hasGeminiKey, reviewCode } from "../ai/gemini.js"
import { compactIfNeeded, normalizeMemory } from "../ai/memory.js"
import { LIMITS, byteLength, rateLimiter } from "../limits.js"

const newId = () => `${Date.now()}-${Math.random()}`

// Review and assistant calls share one budget per person: each costs a
// Gemini request.
const aiLimiter = rateLimiter({ max: 6, windowMs: 60_000 })
const tooMany = (wait) => `Too many AI requests. Try again in ${Math.ceil(wait / 1000)} s.`

export function registerAssistantHandlers(io, socket, { rooms, store }) {
  // The room this socket joined, or undefined.
  const myRoom = (roomId) => (socket.data.roomId === roomId ? rooms.get(roomId) : undefined)

  socket.on("review-code", async ({ roomId } = {}) => {
    const fail = (error) => socket.emit("review-result", { success: false, error, reviewedBy: null })

    const room = myRoom(roomId)
    if (!room) return fail("Room not found. Please rejoin and try again.")
    const code = rooms.codeOf(room)
    if (!code.trim()) return fail("No code found to review.")
    if (byteLength(code) > LIMITS.codeBytes) return fail(`The code is too long to review (limit ${LIMITS.codeBytes / 1024} KB).`)
    if (!hasGeminiKey()) return fail("Gemini API key is missing on backend.")
    const wait = aiLimiter.take(socket.id)
    if (wait) return fail(tooMany(wait))

    const username = socket.data.username
    io.to(roomId).emit("review-started", { username })

    const result = await reviewCode(code, room.language)
    io.to(roomId).emit("review-result", {
      success: result.success,
      review: result.review,
      error: result.error,
      reviewedBy: username
    })
  })

  socket.on("assistant-query", async ({ roomId, question } = {}) => {
    const fail = (error) => socket.emit("assistant-result", {
      success: false, error, askedBy: null, replyingTo: null, question
    })

    const room = myRoom(roomId)
    if (!room) return fail("Room not found. Please rejoin and try again.")
    if (typeof question !== "string" || !question.trim()) return fail("Question cannot be empty.")
    if (question.length > LIMITS.questionChars) return fail(`Questions are limited to ${LIMITS.questionChars} characters.`)
    const code = rooms.codeOf(room)
    if (byteLength(code) > LIMITS.codeBytes) return fail(`The code is too long to send (limit ${LIMITS.codeBytes / 1024} KB).`)
    if (!hasGeminiKey()) return fail("Gemini API key is missing on backend.")
    const wait = aiLimiter.take(socket.id)
    if (wait) return fail(tooMany(wait))

    const username = socket.data.username
    io.to(roomId).emit("assistant-started", { username, replyingTo: username, question })

    const memory = normalizeMemory(await store.getAssistant(roomId))
    const turn = { id: newId(), askedBy: username, replyingTo: username, question, createdAt: Date.now() }
    try {
      const prompt = buildAssistantPrompt({
        code,
        language: room.language,
        question,
        requesterName: username,
        summary: memory.summary,
        recentTurns: memory.recentTurns
      })
      turn.answer = (await generate(prompt)).text
      turn.success = true
    } catch (error) {
      console.error("Assistant handler error:", error)
      turn.error = error?.message || "Failed to get coding assistance"
      turn.success = false
    }

    memory.recentTurns.push(turn)
    memory.updatedAt = Date.now()
    if (turn.success) await compactIfNeeded(memory)
    await store.setAssistant(roomId, memory)

    io.to(roomId).emit("assistant-result", {
      success: turn.success,
      answer: turn.answer,
      error: turn.success ? null : turn.error,
      askedBy: username,
      replyingTo: username,
      question
    })
  })
}
