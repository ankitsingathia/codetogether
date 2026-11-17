// AI review and the room's coding assistant.
import { buildAssistantPrompt, generate, hasGeminiKey, reviewCode } from "../ai/gemini.js"
import { compactIfNeeded, saveMemory } from "../ai/memory.js"
import { LIMITS, byteLength, rateLimiter } from "../limits.js"
import { assistantMemory, codeOf, getRoom, isMember, memberName } from "../rooms.js"

const newId = () => `${Date.now()}-${Math.random()}`

// Review and assistant calls share one budget per person: each costs a
// Gemini request.
const aiLimiter = rateLimiter({ max: 6, windowMs: 60_000 })
const tooMany = (wait) => `Too many AI requests. Try again in ${Math.ceil(wait / 1000)} s.`

export function registerAssistantHandlers(io, socket) {
  socket.on("review-code", async ({ roomId } = {}) => {
    const fail = (error) => socket.emit("review-result", { success: false, error, reviewedBy: null })

    const room = getRoom(roomId)
    if (!room || !isMember(room, socket.id)) return fail("Room not found. Please rejoin and try again.")
    const code = codeOf(room)
    const language = room.language
    if (!code.trim()) return fail("No code found to review.")
    if (byteLength(code) > LIMITS.codeBytes) return fail(`The code is too long to review (limit ${LIMITS.codeBytes / 1024} KB).`)
    if (!hasGeminiKey()) return fail("Gemini API key is missing on backend.")
    const wait = aiLimiter.take(socket.id)
    if (wait) return fail(tooMany(wait))

    const username = memberName(room, socket.id)
    io.to(roomId).emit("review-started", { username })

    const result = await reviewCode(code, language)
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

    const room = getRoom(roomId)
    if (!room || !isMember(room, socket.id)) return fail("Room not found. Please rejoin and try again.")
    if (typeof question !== "string" || !question.trim()) return fail("Question cannot be empty.")
    if (question.length > LIMITS.questionChars) return fail(`Questions are limited to ${LIMITS.questionChars} characters.`)
    if (byteLength(codeOf(room)) > LIMITS.codeBytes) return fail(`The code is too long to send (limit ${LIMITS.codeBytes / 1024} KB).`)
    if (!hasGeminiKey()) return fail("Gemini API key is missing on backend.")
    const wait = aiLimiter.take(socket.id)
    if (wait) return fail(tooMany(wait))

    const username = memberName(room, socket.id)
    const memory = assistantMemory(room)
    const code = codeOf(room)
    const language = room.language
    io.to(roomId).emit("assistant-started", { username, replyingTo: username, question })

    const turn = { id: newId(), askedBy: username, replyingTo: username, question, createdAt: Date.now() }
    try {
      const prompt = buildAssistantPrompt({
        code,
        language,
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
    saveMemory(roomId, memory)
    if (turn.success) await compactIfNeeded(roomId, memory)

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
