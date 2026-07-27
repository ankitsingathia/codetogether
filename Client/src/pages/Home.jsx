import { Link } from "react-router-dom"
import { Code2, ArrowRight, Users, Terminal, Bot } from "lucide-react"
import { Button } from "./../components/ui/Button"
import { ThemeToggle } from "./../components/ThemeToggle"

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">

      {/* ================= HERO SECTION ================= */}
      <main className="flex-1 flex items-center justify-center">
        <section className="w-full max-w-7xl px-4 text-center">
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
            Real-time Collaborative Code Editor
          </h1>

          <p className="mx-auto max-w-[700px] text-gray-500 md:text-xl dark:text-gray-400 my-2 mb-8">
            Write, execute, and collaborate on code in real time.
            Support for multiple programming languages, secure execution environments, and instant updates for all participants.
          </p>

          <div className="flex justify-center gap-4">
            <Link to="/create-room">
              <Button className="flex items-center gap-2">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>

            <Link
              to="https://github.com/ankitsingathia/codetogether"
              target="_blank"
            >
              <Button variant="outline">
                View GitHub
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* ================= FUNCTIONALITY SECTION ================= */}
      <section className="w-full border-t border-gray-200 dark:border-gray-800 py-16">
        <div className="max-w-5xl mx-auto px-4 grid gap-10 md:grid-cols-3 text-center">

          <div className="flex flex-col items-center gap-3">
            <Users className="h-8 w-8 text-blue-600" />
            <h3 className="text-lg font-semibold">Live Collaboration</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Multiple users can edit the same codebase in real time.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <Terminal className="h-8 w-8 text-green-600" />
            <h3 className="text-lg font-semibold">Code Execution</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Run code and view output instantly inside a shared terminal.
            </p>
          </div>

          <div className="flex flex-col items-center gap-3">
            <Bot className="h-8 w-8 text-indigo-600" />
            <h3 className="text-lg font-semibold">AI-Powered Support</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Get instant code reviews and ask AI coding questions while you build.
            </p>
          </div>

        </div>
      </section>

    </div>
  )
}
