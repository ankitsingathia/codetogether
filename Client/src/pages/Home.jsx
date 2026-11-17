import { ArrowRight } from "lucide-react"
import { Button } from "../components/ui/Button"
import { PairDemo } from "../components/PairDemo"

const FACTS = [
  {
    title: "Edits merge. Nobody gets overwritten.",
    body: "The file is a Yjs CRDT. Two people typing on the same line both keep their work, and Ctrl+Z only undoes your own edits.",
  },
  {
    title: "Runs are sandboxed.",
    body: "Each run gets its own Docker container with no network, 256 MB of memory and a 5-second limit. The output streams to everyone in the room.",
  },
  {
    title: "A reviewer when you're stuck.",
    body: "Gemini reviews the file or answers questions about it, and keeps a short memory of what the room has already asked.",
  },
]

export default function HomePage() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-16 lg:pt-20">
        <div>
          <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            Shared editor · Java · C++ · Python
          </p>
          <h1 className="font-display text-[44px] font-extrabold leading-[0.98] tracking-[-0.04em] sm:text-[58px] lg:text-[68px]">
            One file.
            <br />
            Everyone&rsquo;s cursor.
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-muted">
            Open a room, send the ID to whoever you&rsquo;re coding with, and write in the same file at the same time.
            Run it in a sandbox and everyone sees the output.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button to="/create-room" state={{ newRoom: true }}>
              Start a room
              <ArrowRight />
            </Button>
            <Button to="/create-room" variant="quiet">
              Join with a room ID
            </Button>
          </div>
        </div>

        <PairDemo />
      </section>

      <section className="border-t border-line">
        <dl className="mx-auto grid max-w-6xl px-4 sm:px-6 md:grid-cols-3">
          {FACTS.map((fact) => (
            <div
              key={fact.title}
              className="border-b border-line py-8 last:border-b-0 md:border-b-0 md:border-l md:px-8 md:first:border-l-0 md:first:pl-0 md:last:pr-0"
            >
              <dt className="font-display text-[18px] font-bold tracking-[-0.01em]">{fact.title}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-muted">{fact.body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}
