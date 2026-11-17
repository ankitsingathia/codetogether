// Keeps a Monaco editor and a Yjs text in step, and draws other members'
// cursors.
//
// y-monaco does this too, but it imports its own copy of monaco-editor, while
// @monaco-editor/react loads Monaco separately; two copies don't share
// classes. This binding uses the Monaco instance the editor was created with.
import * as Y from "yjs"

export function bindMonaco({ ytext, editor, monaco, awareness }) {
  const model = editor.getModel()
  const doc = ytext.doc
  const localOrigin = { binding: true }
  let applyingRemote = false

  model.setEOL(monaco.editor.EndOfLineSequence.LF)

  const withRemote = (fn) => {
    applyingRemote = true
    try {
      fn()
    } finally {
      applyingRemote = false
    }
  }

  if (model.getValue() !== ytext.toString()) withRemote(() => model.setValue(ytext.toString()))

  // Yjs -> editor. A delta walks the text from the start: retain skips,
  // insert adds, delete removes. Each step is applied before reading the next
  // position, so offsets always refer to the editor's current text.
  const onTextChange = (event, transaction) => {
    if (transaction.origin === localOrigin) return
    withRemote(() => {
      let index = 0
      for (const op of event.delta) {
        if (op.retain) {
          index += op.retain
        } else if (op.insert) {
          const at = model.getPositionAt(index)
          model.applyEdits([{ range: new monaco.Range(at.lineNumber, at.column, at.lineNumber, at.column), text: op.insert }])
          index += op.insert.length
        } else if (op.delete) {
          const from = model.getPositionAt(index)
          const to = model.getPositionAt(index + op.delete)
          model.applyEdits([{ range: new monaco.Range(from.lineNumber, from.column, to.lineNumber, to.column), text: "" }])
        }
      }
    })
    renderCursors()
  }
  ytext.observe(onTextChange)

  // Editor -> Yjs. Monaco reports each change against the text before the
  // event, so they are applied from the end backwards to keep offsets valid.
  const modelListener = model.onDidChangeContent((event) => {
    if (applyingRemote) return
    doc.transact(() => {
      ;[...event.changes]
        .sort((a, b) => b.rangeOffset - a.rangeOffset)
        .forEach((change) => {
          if (change.rangeLength) ytext.delete(change.rangeOffset, change.rangeLength)
          if (change.text) ytext.insert(change.rangeOffset, change.text)
        })
    }, localOrigin)
  })

  // Undo only this person's own edits, not everyone's.
  const undoManager = new Y.UndoManager(ytext, { trackedOrigins: new Set([localOrigin]) })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ, () => undoManager.undo())
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ, () => undoManager.redo())
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY, () => undoManager.redo())

  // Cursor positions are shared as Yjs relative positions, which stay attached
  // to the same character while others edit around them.
  const toRelative = (position) =>
    Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(ytext, model.getOffsetAt(position)))
  const toIndex = (json) => {
    const absolute = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc)
    return absolute && absolute.type === ytext ? absolute.index : null
  }

  const selectionListener = editor.onDidChangeCursorSelection(({ selection }) => {
    if (!editor.hasTextFocus()) return
    awareness.setLocalStateField("cursor", {
      anchor: toRelative(selection.getSelectionStart()),
      head: toRelative(selection.getPosition())
    })
  })

  const style = document.createElement("style")
  document.head.appendChild(style)
  let decorations = []

  function renderCursors() {
    const rules = []
    const next = []
    awareness.getStates().forEach((state, clientId) => {
      if (clientId === doc.clientID || !state.cursor || !state.user) return
      const anchor = toIndex(state.cursor.anchor)
      const head = toIndex(state.cursor.head)
      if (anchor == null || head == null) return

      const color = /^#[0-9a-f]{6}$/i.test(state.user.color) ? state.user.color : "#64748b"
      const name = String(state.user.name || "").replace(/["\\\n\r]/g, "").slice(0, 30)
      rules.push(
        `.remote-selection-${clientId}{background:${color}33}`,
        `.remote-caret-${clientId}{border-left:2px solid ${color};position:relative}`,
        `.remote-caret-${clientId}::after{content:"${name}";position:absolute;top:-1.3em;left:-2px;` +
          `background:${color};color:#fff;font-size:11px;line-height:1.3em;padding:0 4px;white-space:nowrap;` +
          "border-radius:2px;pointer-events:none;z-index:10}",
        // On the first line there is no room above, so the name goes below.
        `.remote-caret-${clientId}.remote-caret-below::after{top:1.3em}`
      )

      const start = model.getPositionAt(Math.min(anchor, head))
      const end = model.getPositionAt(Math.max(anchor, head))
      const caret = model.getPositionAt(head)
      if (anchor !== head) {
        next.push({
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: { className: `remote-selection-${clientId}` }
        })
      }
      next.push({
        range: new monaco.Range(caret.lineNumber, caret.column, caret.lineNumber, caret.column),
        options: {
          beforeContentClassName: `remote-caret-${clientId}${caret.lineNumber === 1 ? " remote-caret-below" : ""}`
        }
      })
    })
    style.textContent = rules.join("\n")
    decorations = editor.deltaDecorations(decorations, next)
  }

  awareness.on("change", renderCursors)
  renderCursors()

  return function unbind() {
    awareness.off("change", renderCursors)
    awareness.setLocalStateField("cursor", null)
    ytext.unobserve(onTextChange)
    modelListener.dispose()
    selectionListener.dispose()
    undoManager.destroy()
    decorations = editor.deltaDecorations(decorations, [])
    style.remove()
  }
}
