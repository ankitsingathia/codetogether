import { useEffect, useRef, useState } from "react"
import { X, Loader2, Bot, User, Send } from "lucide-react"
import { MarkdownContent } from "./MarkdownContent"

export function CodeAssistant({
  isOpen,
  onClose,
  messages,
  isLoading,
  loadingMeta,
  onAskQuestion
}) {
  const [question, setQuestion] = useState("")
  const contentRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    if (!contentRef.current) return
    contentRef.current.scrollTop = contentRef.current.scrollHeight
  }, [messages, isLoading, isOpen])

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = question.trim()
    if (!trimmed || isLoading) return

    onAskQuestion(trimmed)
    setQuestion("")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl h-[85vh] mx-4 bg-white dark:bg-[#1e293b] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Bot className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI Coding Assistant</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Ask questions about your current code</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={contentRef} className="flex-1 overflow-auto p-6 space-y-4">
          {messages.length === 0 && !isLoading ? (
            <div className="h-full flex items-center justify-center text-center text-slate-400">
              <div>
                <Bot className="h-10 w-10 mx-auto mb-3" />
                <p className="text-sm">Ask anything like "How can I optimize this loop?"</p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className="space-y-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 p-1.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{message.askedBy || "You"}</p>
                    <p className="text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{message.question}</p>
                  </div>
                </div>

                {message.success ? (
                  <div className="ml-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center gap-2 mb-2 text-blue-600 dark:text-blue-400 text-sm font-medium">
                      <Bot className="h-4 w-4" />
                      Assistant
                    </div>
                    <MarkdownContent content={message.answer || ""} compact />
                  </div>
                ) : (
                  <div className="ml-7 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-600 dark:text-red-300">
                    {message.error || "Failed to get assistant response"}
                  </div>
                )}
              </div>
            ))
          )}

          {isLoading && (
            <div className="ml-7 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3 text-slate-600 dark:text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" />
              <div>
                <p className="text-sm font-medium">Thinking...</p>
                {loadingMeta?.replyingTo && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Replying to {loadingMeta.replyingTo}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-slate-200 dark:border-slate-700 p-4 shrink-0">
          <div className="flex items-center gap-3">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about bugs, logic, optimization, refactoring..."
              className="flex-1 bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={isLoading || !question.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-900/60 disabled:opacity-60 text-white px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Send className="h-4 w-4" />
              Ask
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
