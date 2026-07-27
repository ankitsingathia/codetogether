import { useEffect, useRef, useState } from "react"
import { useNavigate, useLocation, useParams } from "react-router-dom"
import {
  Code2, Copy, LogOut, Play, Download, RefreshCcw, Menu, X, Sparkles, Bot, Terminal
} from "lucide-react"

import { Button } from "../components/ui/Button"
import { Client } from "../components/ui/Client"
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
  sendProgramInput,
  disconnectSocket,
  changeLanguage,
  onSyncCode,
  onCodeChange,
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

export default function EditorPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { roomId } = useParams()

  const socketRef = useRef(null)
  const editorRef = useRef(null)

  const [code, setCode] = useState("")
  const isRemoteUpdate = useRef(false)

  const [runningUser, setRunningUser] = useState(null)
  const [members, setMembers] = useState([])
  const [language, setLanguage] = useState("java")
  const [consoleOutput, setConsoleOutput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [showConsole, setShowConsole] = useState(true)

  const [showReview, setShowReview] = useState(false)
  const [isReviewing, setIsReviewing] = useState(false)
  const [reviewData, setReviewData] = useState(null)
  const [reviewingUser, setReviewingUser] = useState(null)

  const [showAssistant, setShowAssistant] = useState(false)
  const [isAssistantLoading, setIsAssistantLoading] = useState(false)
  const [assistantLoadingMeta, setAssistantLoadingMeta] = useState(null)
  const [assistantMessages, setAssistantMessages] = useState([])

  useEffect(() => {
    if (!location.state?.username) {
      navigate("/create-room", { state: { roomId } })
      return
    }

    socketRef.current = connectSocket()
    if (!socketRef.current) return

    onMembersUpdate(setMembers)

    onRoomState(({ success, members: roomMembers, code: roomCode, language: roomLanguage }) => {
      if (!success) return
      if (Array.isArray(roomMembers)) {
        setMembers(roomMembers)
      }
      if (typeof roomCode === "string") {
        isRemoteUpdate.current = true
        setCode(roomCode)
        isRemoteUpdate.current = false
      }
      if (typeof roomLanguage === "string") {
        setLanguage(roomLanguage)
      }
    })

    onJoinSuccess(() => {
      requestRoomState(roomId)
    })

    executionStarted(({ username }) => {
      setIsRunning(true)
      setRunningUser(username)
    })

    executionEnded(() => {
      setIsRunning(false)
      setRunningUser(null)
    })

    onSyncCode(({ code, language }) => {
      isRemoteUpdate.current = true
      setCode(code)
      setLanguage(language)
      isRemoteUpdate.current = false
    })

    onCodeChange(({ code }) => {
      if (isRemoteUpdate.current) return
      setCode(code)
    })

    onLanguageChanged(({ language, code }) => {
      isRemoteUpdate.current = true
      setLanguage(language)
      setCode(code)
      isRemoteUpdate.current = false
    })

    onProgramOutput(({ output }) => {
      setConsoleOutput((prev) => prev + output)
      setIsRunning(false)
    })

    onReviewStarted(({ username }) => {
      setIsReviewing(true)
      setReviewingUser(username)
      setShowReview(true)
      setReviewData(null)
    })

    onReviewResult((result) => {
      setIsReviewing(false)
      setReviewData(result)
    })

    onAssistantStarted(({ username, replyingTo, question }) => {
      setIsAssistantLoading(true)
      setAssistantLoadingMeta({ username, replyingTo: replyingTo || username, question })
      setShowAssistant(true)
    })

    onAssistantHistory(({ messages }) => {
      if (!Array.isArray(messages)) return
      setAssistantMessages(messages)
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

    joinRoom(roomId, location.state.username)

    return () => {
      disconnectSocket()
    }
  }, [location.state?.username, navigate, roomId])

  const handleCodeChange = (value = "") => {
    if (isRemoteUpdate.current) return

    setCode(value)

    socketRef.current.emit("code-change", {
      roomId,
      code: value,
    })
  }

  const handleRunCode = () => {
    if (!code) return
    setIsRunning(true)
    const emitted = runCode(roomId, code, language)
    if (!emitted) {
      setIsRunning(false)
      setConsoleOutput((prev) => `${prev}\n[Error] Not connected to backend server. Please restart backend and try again.\n`)
    }
  }

  const sendProgram = (input) => {
    sendProgramInput(roomId, input)
  }

  const handleLanguage = (nextLanguage) => {
    setLanguage(nextLanguage)
    changeLanguage(roomId, nextLanguage)
  }

  const copyRoomId = () => navigator.clipboard.writeText(roomId)

  const leaveRoom = () => {
    disconnectSocket()
    navigate("/")
  }

  const downloadCode = () => {
    const blob = new Blob([code])
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `Main.${language}`
    a.click()
  }

  const resetCode = () => {
    handleCodeChange("")
  }

  const handleReviewCode = () => {
    if (!code) return
    setShowReview(true)
    const emitted = reviewCode(roomId, code, language)
    if (!emitted) {
      setReviewData({
        success: false,
        error: "Not connected to backend server. Please restart backend and try again."
      })
      setIsReviewing(false)
    }
  }

  const handleAskAssistant = (question) => {
    if (!question || !question.trim()) return
    setShowAssistant(true)
    const emitted = askCodingAssistant(roomId, code, language, question)
    if (!emitted) {
      setIsAssistantLoading(false)
      setAssistantLoadingMeta(null)
      setAssistantMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          question,
          askedBy: location.state?.username || "You",
          replyingTo: location.state?.username || "You",
          success: false,
          error: "Not connected to backend server. Please restart backend and try again."
        }
      ])
    }
  }

  return (
    <div className="h-full w-full flex-1 w-screen flex flex-col bg-slate-50 dark:bg-[#1e293b] text-slate-900 dark:text-white overflow-y-auto lg:overflow-hidden">
      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}

        <aside className={`
          w-52 bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-700/50 flex flex-col min-h-0 shrink-0
          fixed lg:relative inset-y-0 left-0 z-50
          transform transition-transform duration-300 ease-in-out
          ${showSidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}>
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Members</span>
            </div>
            <button
              className="lg:hidden p-1 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded text-slate-600 dark:text-slate-400"
              onClick={() => setShowSidebar(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto p-3">
            <ul className="space-y-2">
              {members.map((m) => (
                <Client key={m.socketId} name={m.username} />
              ))}
            </ul>
          </div>

          <div className="p-3 space-y-2 border-t border-slate-200 dark:border-slate-700/50 shrink-0">
            <Button
              onClick={copyRoomId}
              className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy Room ID
            </Button>
            <Button
              onClick={leaveRoom}
              className="w-full bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white text-sm py-2 px-3 rounded flex items-center justify-center gap-2 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Leave Room
            </Button>
          </div>
        </aside>

        <main className="flex flex-1 min-h-0 overflow-hidden flex-col lg:flex-row">
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="bg-slate-100 dark:bg-[#1e293b] border-b border-slate-200 dark:border-slate-700/50 px-2 sm:px-4 py-2 lg:py-0 shrink-0">
              <div className="hidden lg:flex h-11 items-center gap-2 sm:gap-3">
                <select
                  value={language}
                  onChange={e => handleLanguage(e.target.value)}
                  className="bg-white dark:bg-[#334155] border border-slate-300 dark:border-slate-600 rounded px-2 sm:px-3 py-1.5 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="java">Java</option>
                  <option value="cpp">C++</option>
                  <option value="python">Python</option>
                </select>

                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
                  <Code2 className="h-4 w-4" />
                  <span className="text-slate-700 dark:text-slate-300">Main</span>
                  <span className="text-slate-400 dark:text-slate-500">.{language === "java" ? "java" : language === "cpp" ? "cpp" : "py"}</span>
                </div>

                <button
                  onClick={downloadCode}
                  className="ml-auto p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>

                <button
                  onClick={resetCode}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="Reset Code"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReviewCode}
                    disabled={isReviewing}
                    className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 disabled:bg-purple-300 dark:disabled:bg-purple-800 disabled:opacity-50 text-white px-2 sm:px-4 py-1.5 rounded flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors"
                    title="AI Code Review"
                  >
                    <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Review</span>
                  </button>

                  <button
                    onClick={() => setShowAssistant(true)}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-2 sm:px-4 py-1.5 rounded flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors"
                    title="AI Coding Assistant"
                  >
                    <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <span className="hidden sm:inline">Assist</span>
                  </button>
                </div>

                <button
                  onClick={handleRunCode}
                  disabled={isRunning}
                  className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 disabled:bg-green-300 dark:disabled:bg-green-800 disabled:opacity-50 text-white px-2 sm:px-4 py-1.5 rounded flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium transition-colors"
                >
                  <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Run Code</span>
                </button>
              </div>

              <div className="lg:hidden flex flex-col gap-2">
                <div className="h-10 flex items-center gap-2">
                  <button
                    onClick={() => setShowSidebar(true)}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white shrink-0"
                    title="Members"
                  >
                    <Menu className="h-4 w-4" />
                  </button>

                  <select
                    value={language}
                    onChange={e => handleLanguage(e.target.value)}
                    className="bg-white dark:bg-[#334155] border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shrink-0"
                  >
                    <option value="java">Java</option>
                    <option value="cpp">C++</option>
                    <option value="python">Python</option>
                  </select>

                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">Main.{language === "java" ? "java" : language === "cpp" ? "cpp" : "py"}</span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
                  <button
                    onClick={downloadCode}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </button>

                  <button
                    onClick={resetCode}
                    className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700/50 rounded text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                    title="Reset Code"
                  >
                    <RefreshCcw className="h-4 w-4" />
                  </button>

                  <button
                    onClick={handleReviewCode}
                    disabled={isReviewing}
                    className="bg-purple-600 hover:bg-purple-700 dark:bg-purple-600 dark:hover:bg-purple-700 disabled:bg-purple-300 dark:disabled:bg-purple-800 disabled:opacity-50 text-white px-2 py-1.5 rounded flex items-center gap-1 text-xs font-medium transition-colors shrink-0"
                    title="AI Code Review"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Review
                  </button>

                  <button
                    onClick={() => setShowAssistant(true)}
                    className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white px-2 py-1.5 rounded flex items-center gap-1 text-xs font-medium transition-colors shrink-0"
                    title="AI Coding Assistant"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    Assist
                  </button>

                  <button
                    onClick={() => setShowConsole((prev) => !prev)}
                    className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-100 px-2 py-1.5 rounded flex items-center gap-1 text-xs font-medium transition-colors shrink-0"
                    title={showConsole ? "Hide Console" : "Show Console"}
                  >
                    <Terminal className="h-3.5 w-3.5" />
                    {showConsole ? "Hide" : "Term"}
                  </button>

                  <button
                    onClick={handleRunCode}
                    disabled={isRunning}
                    className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700 disabled:bg-green-300 dark:disabled:bg-green-800 disabled:opacity-50 text-white px-2 py-1.5 rounded flex items-center gap-1 text-xs font-medium transition-colors shrink-0"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Run
                  </button>
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 bg-white dark:bg-[#0f172a] overflow-hidden">
              <CodeEditor
                value={code}
                language={language}
                editorRef={editorRef}
                onChange={handleCodeChange}
              />
            </div>
          </div>

          <div className={`
            bg-white dark:bg-[#0f172a] border-l border-slate-200 dark:border-slate-700/50 flex flex-col min-h-0
            lg:w-[400px] lg:block
            ${showConsole ? "h-[36vh] min-h-44 lg:h-auto border-t lg:border-t-0" : "hidden lg:flex"}
          `}>
            <Console
              consoleOutput={consoleOutput}
              isExecuting={isRunning}
              onInput={sendProgram}
              runningUser={runningUser}
            />
          </div>
        </main>
      </div>

      <CodeReview
        isOpen={showReview}
        onClose={() => setShowReview(false)}
        isLoading={isReviewing}
        reviewData={reviewData}
        reviewingUser={reviewingUser}
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
