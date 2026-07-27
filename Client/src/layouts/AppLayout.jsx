import { Outlet } from "react-router-dom"
import { Code2, Github } from "lucide-react"
import { Link } from "react-router-dom"
import { ThemeToggle } from "./../components/ThemeToggle"

export default function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">

      {/* Header */}
      <header className="px-6  lg:px-16 h-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
        <Link to="/" className="flex items-center gap-2 font-bold text-lg">
          <Code2 className="h-5 w-5" />
          real-time-collaborative-coding-platform
        </Link>
        <ThemeToggle />
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 h-10 flex items-center justify-center gap-2 text-xs">
        <span className="text-gray-500 dark:text-gray-400">
          Built for coders • real-time-collaborative-coding-platform
        </span>

        <Link
          to="https://github.com/ankitsingathia"
          target="_blank"
        >
          <Github className="h-4 w-4" />
        </Link>
      </footer>

    </div>
  )
}
