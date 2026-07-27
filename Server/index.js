import express from "express"
import http from "http"
import { Server } from "socket.io"
import cors from "cors"
import { v4 as uuid } from "uuid"
import { exec } from "child_process"
import path from "path"
import fs from "fs"
import { getDockerCommand } from "./dockerCommand.js"
import { spawn } from "child_process"
import dotenv from "dotenv"
import { GoogleGenAI } from "@google/genai"
dotenv.config()

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
const PRIMARY_GEMINI_MODEL = "gemini-2.5-flash-lite"
const FALLBACK_GEMINI_MODEL = "gemini-3.1-flash-lite"

async function generateContentWithFallback(contents) {
  try {
    return await ai.models.generateContent({
      model: PRIMARY_GEMINI_MODEL,
      contents
    })
  } catch (error) {
    const status = error?.status
    const message = String(error?.message || "")
    const shouldFallback = status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)

    if (!shouldFallback) throw error

    return await ai.models.generateContent({
      model: FALLBACK_GEMINI_MODEL,
      contents
    })
  }
}

async function reviewCodeWithGemini(code, language) {
  try {
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
    const response = await generateContentWithFallback(prompt)
    return {
      success: true,
      review: response.text
    }
  } catch (error) {
    console.error("Gemini API Error:", error.message)
    return {
      success: false,
      error: error.message || "Failed to review code"
    }
  }
}

async function getCodingAssistanceWithGemini(code, language, question) {
  try {
    const prompt = `You are a senior ${language} programming assistant helping a student in a collaborative code editor.

Use the provided code and answer the user's question clearly.
- Give a direct answer first.
- If needed, include a short code example.
- Mention concrete fixes relevant to this exact code.
- Keep response concise and practical.

Current ${language} code:

\`\`\`${language}
${code}
\`\`\`

User question:
${question}
`

    const response = await generateContentWithFallback(prompt)

    return {
      success: true,
      answer: response.text
    }
  } catch (error) {
    console.error("Gemini Assistant API Error:", error.message)
    return {
      success: false,
      error: error.message || "Failed to get coding assistance"
    }
  }
}

async function compressAssistantHistoryWithGemini(existingSummary, turns) {
  try {
    const formattedTurns = turns
      .map((turn, index) => {
        return `${index + 1}. User (${turn.askedBy || "Unknown"}): ${turn.question}\nAssistant: ${turn.answer || "No response"}`
      })
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

    const response = await generateContentWithFallback(prompt)

    return {
      success: true,
      summary: response.text
    }
  } catch (error) {
    console.error("Gemini Compression API Error:", error.message)
    return {
      success: false,
      error: error.message || "Failed to compress assistant history"
    }
  }
}

function createAssistantMemory() {
  return {
    summary: "",
    recentTurns: [],
    compressionInProgress: false,
    updatedAt: Date.now()
  }
}

const ASSISTANT_MEMORY_DIR = path.join("uploads", "assistant-memory")

function ensureAssistantMemoryDir() {
  if (!fs.existsSync(ASSISTANT_MEMORY_DIR)) {
    fs.mkdirSync(ASSISTANT_MEMORY_DIR, { recursive: true })
  }
}

function getAssistantMemoryPath(roomId) {
  return path.join(ASSISTANT_MEMORY_DIR, `${roomId}.json`)
}

function loadAssistantMemory(roomId) {
  ensureAssistantMemoryDir()
  const memoryPath = getAssistantMemoryPath(roomId)
  if (!fs.existsSync(memoryPath)) return createAssistantMemory()

  try {
    const raw = fs.readFileSync(memoryPath, "utf-8")
    const parsed = JSON.parse(raw)

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      recentTurns: Array.isArray(parsed.recentTurns) ? parsed.recentTurns : [],
      compressionInProgress: false,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now()
    }
  } catch (error) {
    console.error("Failed to load assistant memory:", error.message)
    return createAssistantMemory()
  }
}

function persistAssistantMemory(roomId, memory) {
  try {
    ensureAssistantMemoryDir()
    const memoryPath = getAssistantMemoryPath(roomId)
    const payload = {
      summary: memory.summary,
      recentTurns: memory.recentTurns,
      updatedAt: memory.updatedAt
    }
    fs.writeFileSync(memoryPath, JSON.stringify(payload, null, 2), "utf-8")
  } catch (error) {
    console.error("Failed to persist assistant memory:", error.message)
  }
}

function deleteAssistantMemory(roomId) {
  try {
    const memoryPath = getAssistantMemoryPath(roomId)
    if (fs.existsSync(memoryPath)) {
      fs.rmSync(memoryPath, { force: true })
    }
  } catch (error) {
    console.error("Failed to delete assistant memory:", error.message)
  }
}

function mapTurnsToClientMessages(turns) {
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

async function compactAssistantMemoryIfNeeded(room) {
  const roomId = room?.roomId
  const memory = room.assistantMemory
  if (!memory || memory.compressionInProgress) return

  const MAX_RECENT_TURNS = 8
  const MAX_RECENT_CHARS = 1200

  const recentChars = memory.recentTurns.reduce((total, turn) => {
    return total + (turn.question?.length || 0) + (turn.answer?.length || 0) + (turn.error?.length || 0)
  }, 0)

  const needsCompaction = memory.recentTurns.length > MAX_RECENT_TURNS || recentChars > MAX_RECENT_CHARS
  if (!needsCompaction) return

  // Keep a tail for short-term context, compact older turns into summary.
  const keepCount = 4
  const turnsToCompress = memory.recentTurns.slice(0, Math.max(0, memory.recentTurns.length - keepCount))
  if (turnsToCompress.length === 0) return

  memory.compressionInProgress = true
  try {
    const compressed = await compressAssistantHistoryWithGemini(memory.summary, turnsToCompress)
    if (compressed.success) {
      memory.summary = compressed.summary
      memory.recentTurns = memory.recentTurns.slice(memory.recentTurns.length - keepCount)
      memory.updatedAt = Date.now()
      if (roomId) {
        persistAssistantMemory(roomId, memory)
      }
    }
  } finally {
    memory.compressionInProgress = false
  }
}

function buildAssistantPrompt({ code, language, question, requesterName, summary, recentTurns }) {
  const formattedRecentTurns = recentTurns
    .map((turn, index) => {
      return `${index + 1}. User (${turn.askedBy || "Unknown"}): ${turn.question}\nAssistant reply to (${turn.replyingTo || turn.askedBy || "Unknown"}): ${turn.success ? (turn.answer || "") : (turn.error || "Request failed")}`
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

const runningProcesses = new Map()
const app = express()

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/$/, "").toLowerCase()
}

function getConfiguredOrigins() {
  const raw = [process.env.FRONTEND_ORIGIN, process.env.FRONTEND_ORIGINS]
    .filter(Boolean)
    .join(",")

  if (!raw) return new Set()

  return new Set(
    raw
      .split(",")
      .map((item) => normalizeOrigin(item))
      .filter(Boolean)
  )
}

const configuredOrigins = getConfiguredOrigins()

function isAllowedOrigin(origin) {
  if (!origin) return true

  const normalizedOrigin = normalizeOrigin(origin)
  if (configuredOrigins.has(normalizedOrigin)) return true

  if (/^https?:\/\/localhost:\d+$/i.test(origin)) return true

  // Allow secure DuckDNS origins used in production deployments.
  if (/^https:\/\/[a-z0-9-]+\.duckdns\.org$/i.test(origin)) return true

  return false
}

app.use(cors(
  {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true)
    return callback(new Error("Not allowed by CORS"))
  },
  methods: ["GET", "POST"],
  credentials: true
}
))

app.get("/", (req, res) => {
  res.status(200).send("🚀 CodeBin Backend is running. try it")
})

const server = http.createServer(app)

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true)
      return callback(new Error("Not allowed by CORS"))
    },
    methods: ["GET", "POST"],
    credentials: true
  },
})

const rooms = {}

function getDefaultCode(language) {
  if (language === "java") return `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, World!");
  }
}`
  if (language === "python") return `print("Hello, World!")`
  if (language === "cpp") return `#include <iostream>
int main() {
  std::cout << "Hello, World!";
}`
}

function cleanupJob(jobDir) {
  try {
    fs.rmSync(jobDir, { recursive: true, force: true })
    // console.log(" Cleaned job directory:", jobDir)
  } catch (err) {
    // console.error(" Failed to cleanup job:", err.message)
  }
}


io.on("connection", (socket) => {
  // console.log("Connected:", socket.id)


  socket.on("check-username", ({ roomId, username }) => {
    const room = rooms[roomId]
    const users = room ? room.users : []

    const exists = users.some(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    )
    socket.emit("username-status", {
      available: !exists,
    })
 })

  socket.on("join-room", ({ roomId, username }) => {

    if (!rooms[roomId]) {
      rooms[roomId] = {
        roomId,
        users: [],
        code: getDefaultCode("java"),
        language: "java",
        assistantMemory: loadAssistantMemory(roomId)
      }
    }

    // final safety check
    const exists = rooms[roomId].users.some(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    )

    if (exists) {
      socket.emit("join-error", {
        message: "Username already taken",
      })
      return
    }

    rooms[roomId].users.push({
      socketId: socket.id,
      username,
    })

    // console.log(rooms)

    socket.join(roomId)
    socket.emit("join-success", {
      roomId,
      username
    })

    io.to(roomId).emit("members-update", rooms[roomId].users)
    socket.emit("sync-code", {
      code: rooms[roomId].code,
      language: rooms[roomId].language
    })

    const assistantMemory = rooms[roomId].assistantMemory || createAssistantMemory()
    rooms[roomId].assistantMemory = assistantMemory
    persistAssistantMemory(roomId, assistantMemory)

    socket.emit("assistant-history", {
      messages: mapTurnsToClientMessages(assistantMemory.recentTurns),
      summary: assistantMemory.summary
    })

  })

  socket.on("request-room-state", ({ roomId }) => {
    const room = rooms[roomId]
    if (!room) {
      socket.emit("room-state", {
        success: false,
        message: "Room not found"
      })
      return
    }

    const isMember = room.users.some((user) => user.socketId === socket.id)
    if (!isMember) {
      socket.emit("room-state", {
        success: false,
        message: "You are not in this room"
      })
      return
    }

    socket.emit("room-state", {
      success: true,
      roomId,
      members: room.users,
      code: room.code,
      language: room.language
    })

    const assistantMemory = room.assistantMemory || createAssistantMemory()
    room.assistantMemory = assistantMemory

    socket.emit("assistant-history", {
      messages: mapTurnsToClientMessages(assistantMemory.recentTurns),
      summary: assistantMemory.summary
    })
  })

  socket.on("code-change", ({ roomId, code }) => {
    const room = rooms[roomId]
    if (!room) return

    room.code = code
    socket.to(roomId).emit("code-change", { code })
  })


  socket.on("run-code", ({ roomId, code, language }) => {
    const room = rooms[roomId]
    if (!room) return

    // Someone already running
    if (room.isRunning) {
      socket.emit("run-denied", {
        message: "Code is already running"
      })
      return
    }

    // Lock the room
    room.isRunning = true
    room.runningBy = {
      socketId: socket.id,
      username: room.users.find(u => u.socketId === socket.id)?.username
    }

    // Notify everyone
    io.to(roomId).emit("execution-started", {
      username: room.runningBy.username
    })

    const jobId = uuid()
    const jobDir = path.join("jobs", jobId)
    fs.mkdirSync(jobDir, { recursive: true })

    let fileName = "Main"
    let ext = language === "java" ? "java" : language === "python" ? "py" : "cpp"

    const filePath = path.join(jobDir, `${fileName}.${ext}`)
    fs.writeFileSync(filePath, code)

    const dockerCmd = getDockerCommand(language, filePath)

    const child = spawn(dockerCmd, {
      shell: true,
      stdio: ["pipe", "pipe", "pipe"]
    })

    runningProcesses.set(socket.id, {
      roomId,
      process: child,
      jobDir
    })

    const EXECUTION_TIMEOUT = 5000 // 5 seconds
    let didFinalize = false
    const finalizeExecution = ({ timedOut = false, errorMessage = null } = {}) => {
      if (didFinalize) return
      didFinalize = true

      const activeRoom = rooms[roomId]
      if (activeRoom) {
        activeRoom.isRunning = false
        activeRoom.runningBy = null
      }

      if (timedOut) {
        io.to(roomId).emit("program-output", {
          output: "\n⏱ Execution timed out (5s limit)\n"
        })
      }

      if (errorMessage) {
        io.to(roomId).emit("program-output", {
          output: `\n❌ ${errorMessage}\n`
        })
      }

      io.to(roomId).emit("execution-ended")

      const entry = runningProcesses.get(socket.id)
      if (entry) {
        cleanupJob(entry.jobDir)
        runningProcesses.delete(socket.id)
      }
    }

    const killTimer = setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGTERM")
      }
      finalizeExecution({ timedOut: true })
    }, EXECUTION_TIMEOUT)

    child.stdout.on("data", (data) => {
      // console.log("Sending output:", data.toString())
      io.to(roomId).emit("program-output", { output: data.toString() })
    })

    child.stderr.on("data", (data) => {
      io.to(roomId).emit("program-output", { output: data.toString() })
    })

    child.on("error", (error) => {
      clearTimeout(killTimer)
      finalizeExecution({ errorMessage: error.message || "Failed to start code execution process" })
    })

    child.on("close", () => {
      clearTimeout(killTimer)
      finalizeExecution()
    })
  })


  socket.on("program-input", ({ roomId, input }) => {
    // write input to stdin
    const entry = runningProcesses.get(socket.id)
    if (!entry?.process) return


    entry.process.stdin.write(input + "\n")

    io.to(roomId).emit("program-input", { input })

  })

  socket.on("change-language", ({ roomId, language }) => {
    if (!rooms[roomId]) return

    rooms[roomId].language = language
    rooms[roomId].code = getDefaultCode(language)

    io.to(roomId).emit("language-changed", {
      language,
      code: rooms[roomId].code,
    })
  })

  // Gemini Code Review Handler

  socket.on("review-code", async ({ roomId, code, language }) => {
    const room = rooms[roomId]
    if (!room) {
      socket.emit("review-result", {
        success: false,
        error: "Room not found. Please rejoin and try again.",
        reviewedBy: null
      })
      return
    }
    if (!code || !String(code).trim()) {
      socket.emit("review-result", {
        success: false,
        error: "No code found to review.",
        reviewedBy: null
      })
      return
    }
    if (!process.env.GEMINI_API_KEY) {
      socket.emit("review-result", {
        success: false,
        error: "Gemini API key is missing on backend.",
        reviewedBy: null
      })
      return
    }
    const username = room.users.find(u => u.socketId === socket.id)?.username

    // Notify everyone that review is starting
    io.to(roomId).emit("review-started", { username })
    try {
      const result = await reviewCodeWithGemini(code, language)
      io.to(roomId).emit("review-result", {
        success: result.success,
        review: result.review,
        error: result.error,
        reviewedBy: username
      })
    } catch (error) {
      console.error("Review handler error:", error)
      const details = error?.message || "Failed to get code review"
      io.to(roomId).emit("review-result", {
        success: false,
        error: details,
        reviewedBy: username
      })
    }
  })

  // Gemini Coding Assistant Handler
  socket.on("assistant-query", async ({ roomId, code, language, question }) => {
    const room = rooms[roomId]
    if (!room) {
      socket.emit("assistant-result", {
        success: false,
        error: "Room not found. Please rejoin and try again.",
        askedBy: null,
        replyingTo: null,
        question
      })
      return
    }
    if (!question || !question.trim()) {
      socket.emit("assistant-result", {
        success: false,
        error: "Question cannot be empty.",
        askedBy: null,
        replyingTo: null,
        question
      })
      return
    }
    if (!process.env.GEMINI_API_KEY) {
      socket.emit("assistant-result", {
        success: false,
        error: "Gemini API key is missing on backend.",
        askedBy: null,
        replyingTo: null,
        question
      })
      return
    }

    const username = room.users.find(u => u.socketId === socket.id)?.username

    io.to(roomId).emit("assistant-started", {
      username,
      replyingTo: username,
      question
    })

    try {
      const assistantMemory = room.assistantMemory || createAssistantMemory()
      room.assistantMemory = assistantMemory

      const prompt = buildAssistantPrompt({
        code,
        language,
        question,
        requesterName: username,
        summary: assistantMemory.summary,
        recentTurns: assistantMemory.recentTurns
      })

      const response = await generateContentWithFallback(prompt)

      const answer = response.text

      const turn = {
        id: `${Date.now()}-${Math.random()}`,
        askedBy: username,
        replyingTo: username,
        question,
        success: true,
        answer,
        createdAt: Date.now()
      }

      assistantMemory.recentTurns.push(turn)
      assistantMemory.updatedAt = Date.now()
      persistAssistantMemory(roomId, assistantMemory)

      await compactAssistantMemoryIfNeeded(room)

      io.to(roomId).emit("assistant-result", {
        success: true,
        answer,
        error: null,
        askedBy: username,
        replyingTo: username,
        question
      })
    } catch (error) {
      console.error("Assistant handler error:", error)
      const details = error?.message || "Failed to get coding assistance"
      const assistantMemory = room.assistantMemory || createAssistantMemory()
      room.assistantMemory = assistantMemory

      assistantMemory.recentTurns.push({
        id: `${Date.now()}-${Math.random()}`,
        askedBy: username,
        replyingTo: username,
        question,
        success: false,
        error: details,
        createdAt: Date.now()
      })
      assistantMemory.updatedAt = Date.now()
      persistAssistantMemory(roomId, assistantMemory)

      io.to(roomId).emit("assistant-result", {
        success: false,
        error: details,
        askedBy: username,
        replyingTo: username,
        question
      })
    }
  })

  socket.on("disconnect", () => {
    const entry = runningProcesses.get(socket.id)
    if (entry?.process) {
      entry.process.kill()
      cleanupJob(entry.jobDir)
      runningProcesses.delete(socket.id)
    }
    for (const roomId in rooms) {

      const room = rooms[roomId]
      room.users = room.users.filter(
        (u) => u.socketId !== socket.id
      )

      io.to(roomId).emit("members-update", room.users)

      if (room.users.length === 0) {
        deleteAssistantMemory(roomId)
        delete rooms[roomId]
      }
    }
  })
})

const PORT = process.env.PORT || 3001
server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Stop the process using this port and restart.`)
    process.exit(1)
  }

  console.error("Server startup error:", error)
  process.exit(1)
})

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${process.env.BACKEND_URL}:${PORT}`)
})