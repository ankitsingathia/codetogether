import { useEffect, useRef, useState } from "react"

export function Console({ consoleOutput, isExecuting, onInput, runningUser, onClear }) {
  const [inputValue, setInputValue] = useState("")
  const outputRef = useRef(null)

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [consoleOutput])

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && inputValue.trim()) {
      onInput?.(inputValue)
      setInputValue("")
    }
  }

  return (
    <div className="flex h-full flex-col bg-sunk">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">Output</span>
        <div className="flex items-center gap-3 text-[12px]">
          {isExecuting && (
            <span className="flex items-center gap-2 text-moss" role="status">
              <span className="size-1.5 animate-pulse rounded-full bg-moss" />
              {runningUser ? `${runningUser} is running it` : "Running"}
            </span>
          )}
          {consoleOutput && !isExecuting && (
            <button type="button" onClick={onClear} className="rounded px-1 text-muted hover:text-ink">
              Clear
            </button>
          )}
        </div>
      </div>

      <div ref={outputRef} className="min-h-0 flex-1 overflow-auto px-4 py-3">
        {consoleOutput ? (
          <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.75] text-ink">{consoleOutput}</pre>
        ) : (
          <p className="max-w-[30ch] text-[13px] leading-relaxed text-muted">
            Press Run to see the output here. Everyone in the room sees the same output.
          </p>
        )}
      </div>

      <label className="flex h-11 shrink-0 items-center gap-3 border-t border-line px-4">
        <span className="font-mono text-[11px] text-muted">stdin</span>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={1000}
          className="min-w-0 flex-1 bg-transparent font-mono text-[12.5px] text-ink outline-none placeholder:text-muted/70"
          placeholder={isExecuting ? "Type a line and press Enter" : "Input for the running program"}
        />
      </label>
    </div>
  )
}
