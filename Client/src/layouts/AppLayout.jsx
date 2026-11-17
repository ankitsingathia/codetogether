import { Outlet } from "react-router-dom"
import { Brand } from "../components/ui/Brand"
import { ThemeToggle } from "../components/ThemeToggle"

const REPO = "https://github.com/ankitsingathia/codetogether"

export default function AppLayout() {
  return (
    <div className="min-h-full flex flex-col bg-paper text-ink">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Brand />
        <nav className="flex items-center gap-1">
          <a href={REPO} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-[14px] text-muted hover:text-ink">
            Source
          </a>
          <ThemeToggle />
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-[13px] text-muted sm:px-6">
          <span>Built by Ankit Singathia</span>
          <span className="font-mono text-[11px]">React · Socket.IO · Yjs · Docker</span>
        </div>
      </footer>
    </div>
  )
}
