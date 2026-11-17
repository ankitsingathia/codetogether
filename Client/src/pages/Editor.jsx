import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate, useParams } from "react-router-dom"
import { Check, Copy, Download, Eraser, LogOut, MessageSquareText, Play, Sparkles } from "lucide-react"

import { Brand } from "../components/ui/Brand"
import { Button } from "../components/ui/Button"
import { Presence } from "../components/ui/Presence"
import { ThemeToggle } from "../components/ThemeToggle"
import { CodeEditor } from "../components/CodeEditor"
import { Console } from "../components/Console"
import { CodeReview } from "../components/CodeReview"
import { CodeAssistant } from "../components/CodeAssistant"

import {
  connectSocket,
  joinRoom,
  onJoinSuccess,
  onMembersUpdate,
  requestRoomState,
  onRoomState,
  runCode,
  onProgramOutput,
  onRunDenied,
  onExecutionQueued,
  sendProgramInput,
  disconnectSocket,
  changeLanguage,
  onLanguageChanged,
  executionEnded,
  executionStarted,
  reviewCode,
  onReviewStarted,
  onReviewResult,
  askCodingAssistant,
  onAssistantStarted,
  onAssistantResult,
  onAssistantHistory
} from "../lib/RoomSocket"
import { createCollab } from "../lib/collab"

const LANGUAGES = [
  { id: "java", label: "Java", file: "Main.java" },
  { id: "cpp", label: "C++", file: "Main.cpp" },
  { id: "python", label: "Python", file: "Main.py" },
]

const NOT_CONNECTED = "Not connected to the server. Check that it is running, then reload the page."

export default function EditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { roomId } = useParams()
  const username = location.state?.username

  const socketRef = useRef(null)
  const editorRef = useRef(null)

  // The room's shared document. Created per visit, before joining, so the
  // first state from the server has somewhere to go.
  const [collab, setCollab] = useState(null)
  // username -> cursor colour, from awareness, so avatars match carets.
  const [cursorColors, setCursorColors] = useState({})

  const [runningUser, setRunningUser] = useState(null)
  const [members, setMembers] = useState([])
  const [language, setLanguage] = useState("java")
  const [consoleOutput, setConsoleOutput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [copied, setCopied] = useState(false)

  const [showReview, setShowReview] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewData, setReviewData] = useState(null)
  const [reviewingUser, setReviewingUser] = useState(null)

  const [showAssistant, setShowAssistant] = useState(false)
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const [assistantLoadingMeta, setAssistantLoadingMeta] = useState(null)
  const [assistantMessages, setAssistantMessages] = useState([])

  const file = LANGUAGES.find((l) => l.id === language)?.file || "Main"
  const print = (line) => setConsoleOutput((prev) => `${prev}${prev && !prev.endsWith("\n") ? "\n" : ""}${line}\n`)

  useEffect(() => {
    if (!username) {
      navigate("/create-room", { state: { roomId } })
      return
    }

    socketRef.current = connectSocket()
    if (!socketRef.current) return

    const roomCollab = createCollab(socketRef.current, roomId, username)
    setCollab(roomCollab)

    onMembersUpdate(setMembers)

    onRoomState(({ success, members: roomMembers, language: roomLanguage }) => {
      if (!success) return
      if (Array.isArray(roomMembers)) setMembers(roomMembers)
      if (typeof roomLanguage === "string") setLanguage(roomLanguage)
    })

    onJoinSuccess(() => {
      roomCollab.announce()
      requestRoomState(roomId)
    })

    executionStarted(({ username: who }) => {
      setIsRunning(true)
      setRunningUser(who)
    })

    executionEnded(() => {
      setIsRunning(false)
      setRunningUser(null)
    })

    onLanguageChanged(({ language: next }) => setLanguage(next))

    onRunDenied(({ message }) => {
      setIsRunning(false)
      setConsoleOutput((prev) => `${prev}${message}\n`)
    })

    onExecutionQueued(({ position }) => {
      setConsoleOutput((prev) => `${prev}Waiting for a free runner (number ${position} in line)…\n`)
    })

    onProgramOutput(({ output }) => setConsoleOutput((prev) => prev + output))

    onReviewStarted(({ username: who }) => {
      setIsReviewing(true)
      setReviewingUser(who)
      setShowReview(true)
      setReviewData(null)
    })

    onReviewResult((result) => {
      setIsReviewing(false)
      setReviewData(result)
    })

    onAssistantStarted(({ username: who, replyingTo, question }) => {
      setIsAssistantLoading(true)
      setAssistantLoadingMeta({ username: who, replyingTo: replyingTo || who, question })
      setShowAssistant(true)
    })

    onAssistantHistory(({ messages }) => {
      if (Array.isArray(messages)) setAssistantMessages(messages)
    })

    onAssistantResult((result) => {
      setIsAssistantLoading(false)
      setAssistantLoadingMeta(null)
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          question: result.question,
          askedBy: result.askedBy,
          replyingTo: result.replyingTo || result.askedBy,
          success: result.success,
          answer: result.answer,
          error: result.error
        }
      ])
    })

    joinRoom(roomId, username)

    return () => {
      roomCollab.destroy()
      setCollab(null)
      disconnectSocket()
    }
  }, [username, navigate, roomId])

  useEffect(() => {
    if (!collab) return
    const update = () => {
      const colors = {}
      collab.awareness.getStates().forEach((state) => {
        if (state.user?.name) colors[state.user.name] = state.user.color
      })
      setCursorColors(colors)
    }
    collab.awareness.on("change", update)
    update()
    return () => collab.awareness.off("change", update)
  }, [collab])

  const currentCode = () => collab?.text.toString() || ""

  // Run, review and the assistant all use the server's copy of the document,
  // so only the room id is sent.
  const handleRunCode = () => {
    if (!currentCode().trim()) {
      print("The file is empty. Write something to run.")
      return
    }
    setIsRunning(true)
    if (!runCode(roomId)) {
      setIsRunning(false)
      print(NOT_CONNECTED)
    }
  }

  const handleLanguage = (next) => {
    if (next === language) return
    const hasCode = currentCode().trim().length > 0
    if (hasCode && !window.confirm(`Switch everyone to ${LANGUAGES.find((l) => l.id === next).label}? This replaces the file with a starter template.`)) {
      return
    }
    setLanguage(next)
    changeLanguage(roomId, next)
  }

  const copyRoomId = async () => {
    await navigator.clipboard.writeText(roomId)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  const leaveRoom = () => {
    disconnectSocket()
    navigate("/")
  }

  const downloadCode = () => {
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob([currentCode()], { type: "text/plain" }))
    a.download = file
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const clearFile = () => {
    if (window.confirm("Clear the file for everyone in the room? Ctrl+Z brings it back.")) collab?.clear()
  }

  const handleReviewCode = () => {
    if (!currentCode().trim()) return
    setShowReview(true)
    if (!reviewCode(roomId)) {
      setReviewData({ success: false, error: NOT_CONNECTED })
      setIsReviewing(false)
    }
  }

  const handleAskAssistant = (question) => {
    setShowAssistant(true)
    if (!askCodingAssistant(roomId, question)) {
      setAssistantMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-${Math.random()}`, question, askedBy: username, success: false, error: NOT_CONNECTED }
      ])
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 sm:gap-3 sm:px-4">
        <Brand compact />
        <span className="hidden h-5 w-px bg-line sm:block" />
        <button
          type="button"
          onClick={copyRoomId}
          title="Copy the room ID to share it"
          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1 font-mono text-[12px] text-ink hover:bg-sunk"
        >
          <span className="truncate">{roomId}</span>
          {copied ? <Check className="size-3.5 shrink-0 text-moss" /> : <Copy className="size-3.5 shrink-0 text-muted" />}
          <span className="sr-only" aria-live="polite">{copied ? "Room ID copied" : ""}</span>
        </button>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Presence members={members} colors={cursorColors} me={username} />
          <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={leaveRoom} title="Leave the room">
            <LogOut />
            <span className="hidden sm:inline">Leave</span>
          </Button>
        </div>
      </header>

      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-line bg-panel px-3 sm:px-4">
        <div role="radiogroup" aria-label="Language" className="flex shrink-0 rounded-md bg-sunk p-0.5">
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={language === l.id}
              onClick={() => handleLanguage(l.id)}
              className={`h-7 rounded-[5px] px-3 text-[13px] font-medium transition-colors ${
                language === l.id ? "bg-panel text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)]" : "text-muted hover:text-ink"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        <span className="hidden shrink-0 pl-2 font-mono text-[12px] text-muted md:inline">{file}</span>
        <Button variant="ghost" size="icon" onClick={downloadCode} aria-label={`Download ${file}`} title={`Download ${file}`}>
          <Download />
        </Button>
        <Button variant="ghost" size="icon" onClick={clearFile} aria-label="Clear the file" title="Clear the file">
          <Eraser />
        </Button>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Button variant="quiet" size="sm" onClick={handleReviewCode} disabled={isReviewing}>
            <Sparkles />
            {isReviewing ? "Reviewing…" : "Review"}
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setShowAssistant(true)}>
            <MessageSquareText />
            Ask
          </Button>
          <Button variant="run" size="sm" onClick={handleRunCode} disabled={isRunning} title="Run the file for everyone">
            <Play />
            {isRunning ? "Running…" : "Run"}
          </Button>
        </div>
      </div>

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="min-h-[45vh] flex-1 bg-panel lg:min-h-0">
          <CodeEditor language={language} collab={collab} editorRef={editorRef} />
        </div>
        <aside className="h-[38vh] shrink-0 border-t border-line lg:h-auto lg:w-[400px] lg:border-l lg:border-t-0">
          <Console
            consoleOutput={consoleOutput}
            isExecuting={isRunning}
            onInput={(input) => sendProgramInput(roomId, input)}
            onClear={() => setConsoleOutput("")}
            runningUser={runningUser}
          />
        </aside>
      </main>

      <CodeReview
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        isLoading={isReviewing}
        reviewData={reviewData}
        reviewingUser={reviewingUser}
        fileName={file}
      />

      <CodeAssistant
        isOpen={showAssistant}
        onClose={() => setShowAssistant(false)}
        messages={assistantMessages}
        isLoading={isAssistantLoading}
        loadingMeta={assistantLoadingMeta}
        onAskQuestion={handleAskAssistant}
      />
    </div>
  )
}
