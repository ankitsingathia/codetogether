// Input checks and per-client rate limits. Everything a client sends is
// checked here before it reaches a room, a container or Gemini.
import { LANGUAGES } from "./rooms.js"

export const LIMITS = {
  codeBytes: 64 * 1024, // largest program that can be run or reviewed
  updateBytes: 256 * 1024, // largest single edit message
  outputBytes: 64 * 1024, // output kept per run before the program is stopped
  inputChars: 1000, // one line of program input
  questionChars: 2000,
  runTimeoutMs: Number(process.env.RUN_TIMEOUT_MS) || 5000
}

const ROOM_ID = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/i
// Letters in any script, including the vowel signs (marks) that Hindi and
// other Indic scripts need, digits, spaces and a little punctuation.
const USERNAME = /^[\p{L}\p{M}\p{N} _.-]{1,20}$/u

export const isRoomId = (value) => typeof value === "string" && ROOM_ID.test(value)
export const isUsername = (value) => typeof value === "string" && USERNAME.test(value.trim()) && value.trim() === value
export const isLanguage = (value) => LANGUAGES.includes(value)
export const byteLength = (text) => Buffer.byteLength(text, "utf8")

/**
 * Sliding-window counter: allows `max` events per `windowMs` for each key.
 * `take(key)` returns 0 when allowed, otherwise the milliseconds until the
 * next event would be.
 */
export function rateLimiter({ max, windowMs, now = Date.now }) {
  const events = new Map()

  return {
    take(key) {
      const t = now()
      const recent = (events.get(key) || []).filter((at) => t - at < windowMs)
      if (recent.length >= max) {
        events.set(key, recent)
        return windowMs - (t - recent[0])
      }
      recent.push(t)
      events.set(key, recent)
      return 0
    },
    forget(key) {
      events.delete(key)
    }
  }
}
