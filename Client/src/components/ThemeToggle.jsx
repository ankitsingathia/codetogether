import { Moon, Sun } from "lucide-react"
import { useTheme } from "../contexts/ThemeContext"
import { Button } from "./ui/Button"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const next = theme === "dark" ? "light" : "dark"

  return (
    <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  )
}
