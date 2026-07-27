import { useEffect } from "react"
import Editor from "@monaco-editor/react"
import { useTheme } from "../contexts/ThemeContext.jsx"

export function CodeEditor({
  value,
  language,
  onChange,
  editorRef,
}) {
  const { theme } = useTheme()

  // When editor mounts
  const handleMount = (editor, monaco) => {
    editorRef.current = editor

    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "light")
  }

  useEffect(() => {
    if (window.monaco) {
      window.monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "light")
    }
  }, [theme])

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        language={language}
        value={value}
        onMount={handleMount}
        onChange={onChange}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: "on",
          automaticLayout: true,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  )
}
