// The assistant's per-room conversation memory: the last few turns verbatim,
// older turns compressed into a summary by Gemini. Kept on disk so a server
// restart doesn't lose it while the room is still open.
import fs from "fs"
import path from "path"

import { compressHistory } from "./gemini.js"

const MEMORY_DIR = path.join("uploads", "assistant-memory")
const MAX_RECENT_TURNS = 8
const MAX_RECENT_CHARS = 1200
const KEEP_TURNS = 4

export function createMemory() {
  return { summary: "", recentTurns: [], compressionInProgress: false, updatedAt: Date.now() }
}

function memoryPath(roomId) {
  return path.join(MEMORY_DIR, `${roomId}.json`)
}

function ensureDir() {
  fs.mkdirSync(MEMORY_DIR, { recursive: true })
}

export function loadMemory(roomId) {
  ensureDir()
  const file = memoryPath(roomId)
  if (!fs.existsSync(file)) return createMemory()

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"))
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      recentTurns: Array.isArray(parsed.recentTurns) ? parsed.recentTurns : [],
      compressionInProgress: false,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now()
    }
  } catch (error) {
    console.error("Failed to load assistant memory:", error.message)
    return createMemory()
  }
}

export function saveMemory(roomId, memory) {
  try {
    ensureDir()
    const { summary, recentTurns, updatedAt } = memory
    fs.writeFileSync(memoryPath(roomId), JSON.stringify({ summary, recentTurns, updatedAt }, null, 2), "utf-8")
  } catch (error) {
    console.error("Failed to persist assistant memory:", error.message)
  }
}

export function deleteMemory(roomId) {
  try {
    fs.rmSync(memoryPath(roomId), { force: true })
  } catch (error) {
    console.error("Failed to delete assistant memory:", error.message)
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
// the summary.
export async function compactIfNeeded(roomId, memory) {
  if (!memory || memory.compressionInProgress) return

  const recentChars = memory.recentTurns.reduce(
    (total, turn) => total + (turn.question?.length || 0) + (turn.answer?.length || 0) + (turn.error?.length || 0),
    0
  )
  if (memory.recentTurns.length <= MAX_RECENT_TURNS && recentChars <= MAX_RECENT_CHARS) return

  const older = memory.recentTurns.slice(0, Math.max(0, memory.recentTurns.length - KEEP_TURNS))
  if (older.length === 0) return

  memory.compressionInProgress = true
  try {
    const compressed = await compressHistory(memory.summary, older)
    if (compressed.success) {
      memory.summary = compressed.summary
      memory.recentTurns = memory.recentTurns.slice(-KEEP_TURNS)
      memory.updatedAt = Date.now()
      saveMemory(roomId, memory)
    }
  } finally {
    memory.compressionInProgress = false
  }
}
