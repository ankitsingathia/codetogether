import { useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { useTheme } from "../contexts/ThemeContext.jsx"
import { bindMonaco } from "../lib/monacoBinding"

// The editor holds no text state of its own: its content comes from the
// room's shared Yjs document through the binding.
export function CodeEditor({ language, collab, editorRef }) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(null)

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "light")
    setMounted({ editor, monaco })
  }

  useEffect(() => {
    if (window.monaco) {
      window.monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "light")
    }
  }, [theme])

  useEffect(() => {
    if (!mounted || !collab) return
    return bindMonaco({
      ytext: collab.text,
      editor: mounted.editor,
      monaco: mounted.monaco,
      awareness: collab.awareness
    })
  }, [mounted, collab])

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        language={language}
        defaultValue=""
        onMount={handleMount}
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
