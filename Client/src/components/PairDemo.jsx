import { useEffect, useState } from "react"

// A scripted replay of what the editor does: alice and bob type into the same
// file at the same time. Alice's typing pushes bob's cursor down the file and
// neither loses a character, which is the CRDT doing its job. Then bob runs it.
//
// With reduced motion the finished state is shown and nothing moves.

const START = "def greet(name):\n    \n\n"
const ALICE = 'return f"Hello, {name}!"'
const BOB = 'for person in ["alice", "bob"]:\n    print(greet(person))'
const OUTPUT = ["Hello, alice!", "Hello, bob!"]
const TICK_MS = 75
const BOB_DELAY_TICKS = 7

function initial() {
  return { doc: START, alice: 21, bob: START.length, ai: 0, bi: 0, ticks: 0, ran: false }
}

function finished() {
  let s = initial()
  while (!isDone(s)) s = step(s)
  return { ...s, ran: true }
}

const isDone = (s) => s.ai >= ALICE.length && s.bi >= BOB.length

function step(s) {
  let { doc, alice, bob, ai, bi } = s
  if (ai < ALICE.length) {
    doc = doc.slice(0, alice) + ALICE[ai] + doc.slice(alice)
    alice++
    bob++ // bob's cursor is further down, so alice's character moves it along
    ai++
  }
  if (s.ticks >= BOB_DELAY_TICKS && bi < BOB.length) {
    doc = doc.slice(0, bob) + BOB[bi] + doc.slice(bob)
    bob++
    bi++
  }
  return { ...s, doc, alice, bob, ai, bi, ticks: s.ticks + 1 }
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function PairDemo() {
  const [state, setState] = useState(() => (reducedMotion() ? finished() : initial()))

  useEffect(() => {
    if (reducedMotion()) return
    const timer = setInterval(() => setState((s) => (isDone(s) ? s : step(s))), TICK_MS)
    return () => clearInterval(timer)
  }, [])

  // Once both have finished typing: run, hold, start over.
  const done = isDone(state)
  useEffect(() => {
    if (!done || reducedMotion()) return
    const run = setTimeout(() => setState((s) => ({ ...s, ran: true })), 700)
    const reset = setTimeout(() => setState(initial()), 5200)
    return () => {
      clearTimeout(run)
      clearTimeout(reset)
    }
  }, [done])

  const lines = toLines(state.doc, [
    { at: state.alice, who: "alice" },
    { at: state.bob, who: "bob" },
  ])

  return (
    <figure
      className="relative overflow-hidden rounded-xl border border-line bg-panel shadow-[0_30px_60px_-30px_rgb(21_32_28/0.35)]"
      aria-label="Two people, alice and bob, typing into the same Python file at the same time"
    >
      <div className="flex h-10 items-center justify-between border-b border-line bg-sunk px-4">
        <span className="font-mono text-[11.5px] text-ink">greet.py</span>
        <span className="flex items-center gap-3 text-[12px] text-muted">
          <Who name="alice" color="var(--marigold)" />
          <Who name="bob" color="var(--cobalt)" />
        </span>
      </div>

      <pre className="m-0 overflow-hidden py-5 font-mono text-[12.5px] leading-[2] sm:text-[13px]" aria-hidden="true">
        {lines.map((parts, i) => (
          <div key={i} className="flex">
            <span className="w-11 shrink-0 select-none pr-4 text-right text-muted/60">{i + 1}</span>
            <span className="min-w-0 whitespace-pre text-ink">
              {parts.map((p, j) =>
                p.caret ? <Caret key={j} who={p.caret} /> : <Highlight key={j} text={p.text} />
              )}
            </span>
          </div>
        ))}
      </pre>

      <div className="border-t border-line bg-sunk px-4 py-3 font-mono text-[12px] leading-[1.8]" aria-live="off">
        <div className="flex items-center justify-between text-muted">
          <span>Output</span>
          {state.ran && <span className="text-moss">bob ran greet.py</span>}
        </div>
        <div className="min-h-[3.6em] text-ink">
          {state.ran ? OUTPUT.map((line) => <div key={line}>{line}</div>) : <span className="text-muted/70">…</span>}
        </div>
      </div>
    </figure>
  )
}

function Who({ name, color }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {name}
    </span>
  )
}

function Caret({ who }) {
  const color = who === "alice" ? "var(--marigold)" : "var(--cobalt)"
  return (
    // A zero-width box the height of the text, so the bar and its name tag
    // sit on the line the character is on.
    <span className="relative inline-block h-[1.4em] w-0 align-[-0.3em]">
      <span className="absolute inset-y-0 left-0 w-[2px] -translate-x-px" style={{ background: color }} />
      <span
        className="absolute bottom-full left-[-1px] rounded-[3px] rounded-bl-none px-1 font-sans text-[10px] font-semibold leading-[1.5] text-white"
        style={{ background: color }}
      >
        {who}
      </span>
    </span>
  )
}

const TOKENS = /(\b(?:def|return|for|in)\b|"[^"\n]*"?|f(?="))/g

function Highlight({ text }) {
  const out = []
  let last = 0
  for (const m of text.matchAll(TOKENS)) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const isString = m[0].startsWith('"') || m[0] === "f"
    out.push(
      <span key={m.index} style={{ color: isString ? "var(--syn-str)" : "var(--syn-kw)" }} className={isString ? "" : "font-semibold"}>
        {m[0]}
      </span>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out}</>
}

// Splits the document into lines of text runs, with the carets placed at
// their character offsets.
function toLines(doc, carets) {
  const lines = [[]]
  let run = ""
  const flush = () => {
    if (run) lines[lines.length - 1].push({ text: run })
    run = ""
  }
  for (let i = 0; i <= doc.length; i++) {
    for (const c of carets) {
      if (c.at === i) {
        flush()
        lines[lines.length - 1].push({ caret: c.who })
      }
    }
    if (i === doc.length) break
    if (doc[i] === "\n") {
      flush()
      lines.push([])
    } else {
      run += doc[i]
    }
  }
  flush()
  return lines
}
