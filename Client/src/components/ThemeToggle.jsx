import { Sun, Moon } from "lucide-react"
import { useTheme } from "../contexts/ThemeContext"
import { Button } from "./ui/Button"

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()

  return (
    <Button onClick={toggleTheme} variant="outline" className="h-8 w-8 !p-0 flex items-center justify-center">
      {theme === "light" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </Button>
  )
}
