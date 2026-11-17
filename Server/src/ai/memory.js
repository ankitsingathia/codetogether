// The assistant's per-room conversation memory: the last few turns verbatim,
// older turns compressed into a summary by Gemini. It lives in the store with
// the rest of the room, so every server sees the same conversation.
import { compressHistory } from "./gemini.js"

const MAX_RECENT_TURNS = 8
const MAX_RECENT_CHARS = 1200
const KEEP_TURNS = 4

export function createMemory() {
  return { summary: "", recentTurns: [], updatedAt: Date.now() }
}

// Reads whatever the store holds, tolerating a missing or malformed value.
export function normalizeMemory(raw) {
  if (!raw || typeof raw !== "object") return createMemory()
  return {
    summary: typeof raw.summary === "string" ? raw.summary : "",
    recentTurns: Array.isArray(raw.recentTurns) ? raw.recentTurns : [],
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now()
  }
}

export function toClientMessages(turns) {
  return turns.map((turn) => ({
    id: turn.id,
    question: turn.question,
    askedBy: turn.askedBy,
    replyingTo: turn.replyingTo || turn.askedBy,
    success: turn.success,
    answer: turn.answer,
    error: turn.error
  }))
}

// Once the recent turns grow past the limits, folds all but the last few into
// the summary. Changes `memory` in place; the caller saves it.
export async function compactIfNeeded(memory) {
  const recentChars = memory.recentTurns.reduce(
    (total, turn) => total + (turn.question?.length || 0) + (turn.answer?.length || 0) + (turn.error?.length || 0),
    0
  )
  if (memory.recentTurns.length <= MAX_RECENT_TURNS && recentChars <= MAX_RECENT_CHARS) return

  const older = memory.recentTurns.slice(0, Math.max(0, memory.recentTurns.length - KEEP_TURNS))
  if (older.length === 0) return

  const compressed = await compressHistory(memory.summary, older)
  if (compressed.success) {
    memory.summary = compressed.summary
    memory.recentTurns = memory.recentTurns.slice(-KEEP_TURNS)
    memory.updatedAt = Date.now()
  }
}
