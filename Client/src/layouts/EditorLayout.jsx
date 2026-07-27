import { Outlet } from "react-router-dom"
import { Code2, Github } from "lucide-react"
import { Link } from "react-router-dom"
import { ThemeToggle } from "./../components/ThemeToggle"

export default function EditorLayout() {
  return (
    <div className="h-screen max-h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">

      {/* Header */}
      <header className="px-6   lg:px-16 h-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <Code2 className="h-5 w-5" />
          real-time-collaborative-coding-platform
        </Link>
        <ThemeToggle />
      </header>

      {/* Page content */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>

    </div>
  )
}
