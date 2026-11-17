import { useEffect, useState } from "react"
import Editor from "@monaco-editor/react"
import { useTheme } from "../contexts/ThemeContext.jsx"
import { bindMonaco } from "../lib/monacoBinding"

// Monaco themes built from the app's palette, so the editor doesn't look
// pasted in from somewhere else.
function defineThemes(monaco) {
  monaco.editor.defineTheme("ct-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "23784A", fontStyle: "bold" },
      { token: "string", foreground: "B4532A" },
      { token: "number", foreground: "2648D8" },
      { token: "comment", foreground: "8A968F", fontStyle: "italic" },
      { token: "type", foreground: "7B4FD6" },
    ],
    colors: {
      "editor.background": "#FFFFFF",
      "editor.foreground": "#15201C",
      "editorLineNumber.foreground": "#A9B3AD",
      "editorLineNumber.activeForeground": "#15201C",
      "editor.lineHighlightBackground": "#F5F7F4",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#2648D82E",
      "editorCursor.foreground": "#15201C",
      "editorIndentGuide.background1": "#E6EAE6",
      "editorGutter.background": "#FFFFFF",
      "scrollbarSlider.background": "#15201C1A",
    },
  })
  monaco.editor.defineTheme("ct-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "4CB37A", fontStyle: "bold" },
      { token: "string", foreground: "E08A5E" },
      { token: "number", foreground: "8EA3FF" },
      { token: "comment", foreground: "6B7872", fontStyle: "italic" },
      { token: "type", foreground: "B69CFF" },
    ],
    colors: {
      "editor.background": "#151D1A",
      "editor.foreground": "#E4EAE6",
      "editorLineNumber.foreground": "#4A5751",
      "editorLineNumber.activeForeground": "#E4EAE6",
      "editor.lineHighlightBackground": "#1B2521",
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": "#6F8BFF3D",
      "editorCursor.foreground": "#E4EAE6",
      "editorIndentGuide.background1": "#222C28",
      "editorGutter.background": "#151D1A",
      "scrollbarSlider.background": "#E4EAE61A",
    },
  })
}

// The editor holds no text state of its own: its content comes from the
// room's shared Yjs document through the binding.
export function CodeEditor({ language, collab, editorRef }) {
  const { theme } = useTheme()
  const [mounted, setMounted] = useState(null)

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    // The code font is a web font; measure again once it has loaded so the
    // cursor lines up with the characters.
    document.fonts?.ready.then(() => monaco.editor.remeasureFonts())
    setMounted({ editor, monaco })
  }

  useEffect(() => {
    if (!mounted || !collab) return
    return bindMonaco({
      ytext: collab.text,
      editor: mounted.editor,
      monaco: mounted.monaco,
      awareness: collab.awareness,
    })
  }, [mounted, collab])

  return (
    <Editor
      height="100%"
      language={language}
      defaultValue=""
      theme={theme === "dark" ? "ct-dark" : "ct-light"}
      beforeMount={defineThemes}
      onMount={handleMount}
      loading={<span className="font-mono text-[12px] text-muted">Loading the editor…</span>}
      options={{
        fontFamily: "'Martian Mono', ui-monospace, monospace",
        fontSize: 13,
        lineHeight: 22,
        minimap: { enabled: false },
        wordWrap: "on",
        automaticLayout: true,
        scrollBeyondLastLine: false,
        padding: { top: 14, bottom: 14 },
        renderLineHighlight: "line",
        lineNumbersMinChars: 3,
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  )
}
