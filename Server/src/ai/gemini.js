import { GoogleGenAI } from "@google/genai"

import { config } from "../config.js"

// The SDK throws when constructed without a key, which used to crash the whole
// server on startup. Without a key the editor still works; review and
// assistant requests are answered with a "key missing" error.
const ai = config.geminiApiKey ? new GoogleGenAI({ apiKey: config.geminiApiKey }) : null

const PRIMARY_MODEL = "gemini-2.5-flash-lite"
const FALLBACK_MODEL = "gemini-3.1-flash-lite"

export const hasGeminiKey = () => Boolean(ai)

// Tries the primary model and switches to the fallback only when the primary
// is out of quota.
export async function generate(contents) {
  try {
    return await ai.models.generateContent({ model: PRIMARY_MODEL, contents })
  } catch (error) {
    const message = String(error?.message || "")
    const outOfQuota = error?.status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)
    if (!outOfQuota) throw error
    return await ai.models.generateContent({ model: FALLBACK_MODEL, contents })
  }
}

export async function reviewCode(code, language) {
  const prompt = `You are an expert code reviewer. Please review the following ${language} code and provide:

1. **Code Quality**: Rate the overall code quality (Excellent/Good/Fair/Poor)
2. **Issues Found**: List any bugs, errors, or potential problems
3. **Suggestions**: Provide specific improvements for:
   - Performance optimizations
   - Code readability
   - Best practices
   - Security concerns (if any)
4. **Corrected Code**: If there are issues, provide the corrected version
Keep the review concise but helpful. Format your response in markdown.

\`\`\`${language}
${code}
\`\`\`

`
  try {
    const response = await generate(prompt)
    return { success: true, review: response.text }
  } catch (error) {
    console.error("Gemini API Error:", error.message)
    return { success: false, error: error.message || "Failed to review code" }
  }
}

export async function compressHistory(existingSummary, turns) {
  const formattedTurns = turns
    .map((turn, index) => `${index + 1}. User (${turn.askedBy || "Unknown"}): ${turn.question}\nAssistant: ${turn.answer || "No response"}`)
    .join("\n\n")

  const prompt = `You are compressing coding assistant conversation history for long-term memory in a collaborative code editor.

Goal:
- Preserve technical decisions, constraints, bugs discovered, fixes proposed, and unresolved follow-ups.
- Remove repetition and conversational filler.
- Keep it concise and structured.

Existing summary:
${existingSummary || "None"}

New turns to merge:
${formattedTurns || "None"}

Return only markdown with these sections:
1. Key Context
2. Decisions & Fixes
3. Open Items
`
  try {
    const response = await generate(prompt)
    return { success: true, summary: response.text }
  } catch (error) {
    console.error("Gemini Compression API Error:", error.message)
    return { success: false, error: error.message || "Failed to compress assistant history" }
  }
}

export function buildAssistantPrompt({ code, language, question, requesterName, summary, recentTurns }) {
  const formattedRecentTurns = recentTurns
    .map((turn, index) => {
      const reply = turn.success ? (turn.answer || "") : (turn.error || "Request failed")
      return `${index + 1}. User (${turn.askedBy || "Unknown"}): ${turn.question}\nAssistant reply to (${turn.replyingTo || turn.askedBy || "Unknown"}): ${reply}`
    })
    .join("\n\n")

  return `You are a senior ${language} programming assistant helping a student in a collaborative code editor.

Use the provided code and the room conversation memory to answer the latest question.
Current requester name: ${requesterName || "Unknown"}

Room long-term memory summary:
${summary || "No summary yet."}

Recent turns:
${formattedRecentTurns || "No recent turns yet."}

Current ${language} code:

\`\`\`${language}
${code}
\`\`\`

Latest user question:
${question}
`
}
