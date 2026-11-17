import { useEffect, useRef, useState } from "react"
import { ArrowUp } from "lucide-react"
import { Drawer } from "./Drawer"
import { MarkdownContent } from "./MarkdownContent"
import { Button } from "./ui/Button"

const EXAMPLES = ["Why does this loop never end?", "How do I read a number from input?", "Is there a faster way to do this?"]

export function CodeAssistant({ isOpen, onClose, messages, isLoading, loadingMeta, onAskQuestion }) {
  const [question, setQuestion] = useState("")
  const contentRef = useRef(null)

  useEffect(() => {
    if (isOpen && contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight
  }, [messages, isLoading, isOpen])

  if (!isOpen) return null

  const ask = (text) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return
    onAskQuestion(trimmed)
    setQuestion("")
  }

  return (
    <Drawer
      title="Ask about this file"
      subtitle="Gemini sees the current file and the room's earlier questions"
      onClose={onClose}
      footer={
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(question)
          }}
          className="shrink-0 border-t border-line p-4"
        >
          <div className="flex items-center gap-2 rounded-lg border border-line bg-panel p-1.5 pl-3 focus-within:border-cobalt focus-within:ring-3 focus-within:ring-cobalt/15">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={2000}
              placeholder="Ask a question about the code"
              aria-label="Your question"
              className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
            />
            <Button type="submit" size="icon" disabled={isLoading || !question.trim()} aria-label="Send question">
              <ArrowUp />
            </Button>
          </div>
        </form>
      }
    >
      <div ref={contentRef} className="flex-1 space-y-7 overflow-auto px-6 py-6">
        {messages.length === 0 && !isLoading && (
          <div>
            <p className="text-[14px] text-muted">Everyone in the room sees the questions and answers. Try one:</p>
            <div className="mt-3 flex flex-col items-start gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => ask(example)}
                  className="rounded-md border border-line px-3 py-1.5 text-left text-[13.5px] text-ink hover:bg-sunk"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <article key={message.id}>
            <p className="font-mono text-[11px] text-muted">{message.askedBy || "You"} asked</p>
            <p className="mt-1 whitespace-pre-wrap font-medium text-ink">{message.question}</p>
            {message.success ? (
              <div className="mt-3 border-l-2 border-cobalt pl-4">
                <MarkdownContent content={message.answer || ""} compact />
              </div>
            ) : (
              <p className="mt-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[14px] text-danger">
                {message.error || "No answer came back. Try asking again."}
              </p>
            )}
          </article>
        ))}

        {isLoading && (
          <div className="border-l-2 border-line pl-4" role="status">
            <p className="text-[14px] text-muted">
              Answering{loadingMeta?.replyingTo ? ` ${loadingMeta.replyingTo}` : ""}…
            </p>
          </div>
        )}
      </div>
    </Drawer>
  )
}
