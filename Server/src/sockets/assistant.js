// AI review and the room's coding assistant.
import { buildAssistantPrompt, generate, hasGeminiKey, reviewCode } from "../ai/gemini.js"
import { compactIfNeeded, saveMemory } from "../ai/memory.js"
import { assistantMemory, codeOf, getRoom, memberName } from "../rooms.js"

const newId = () => `${Date.now()}-${Math.random()}`

export function registerAssistantHandlers(io, socket) {
  socket.on("review-code", async ({ roomId }) => {
    const fail = (error) => socket.emit("review-result", { success: false, error, reviewedBy: null })

    const room = getRoom(roomId)
    if (!room) return fail("Room not found. Please rejoin and try again.")
    const code = codeOf(room)
    const language = room.language
    if (!code || !String(code).trim()) return fail("No code found to review.")
    if (!hasGeminiKey()) return fail("Gemini API key is missing on backend.")

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

  socket.on("assistant-query", async ({ roomId, question }) => {
    const fail = (error) => socket.emit("assistant-result", {
      success: false, error, askedBy: null, replyingTo: null, question
    })

    const room = getRoom(roomId)
    if (!room) return fail("Room not found. Please rejoin and try again.")
    if (!question || !question.trim()) return fail("Question cannot be empty.")
    if (!hasGeminiKey()) return fail("Gemini API key is missing on backend.")

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
