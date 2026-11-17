/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

export function ThemeProvider({ children }) {
    const [theme, setTheme] = useState(() => {
        // A saved choice wins; otherwise follow the system setting.
        try {
            const saved = localStorage.getItem('theme')
            if (saved === 'light' || saved === 'dark') return saved
        } catch {
            // storage can be blocked; fall through to the system setting
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    })

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark'
        setTheme(newTheme)
        try {
            localStorage.setItem('theme', newTheme)
        } catch {
            // not saved; the choice still applies for this visit
        }
    }
    useEffect(() => {
        document.documentElement.classList.toggle("dark", theme === "dark")
    }, [theme])


    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
} 