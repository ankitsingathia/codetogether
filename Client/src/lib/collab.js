// The room's shared document on this client: a Yjs doc whose edits travel
// over the existing Socket.IO connection, plus "awareness" (who is here and
// where their cursor is).
import * as Y from "yjs"
import {
  Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates
} from "y-protocols/awareness"

// Marks changes that came from the server, so they aren't sent straight back.
const REMOTE = "remote"

const COLORS = ["#e11d48", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#65a30d"]

export function createCollab(socket, roomId, username) {
  const doc = new Y.Doc()
  const text = doc.getText("code")
  const awareness = new Awareness(doc)
  awareness.setLocalStateField("user", {
    name: username,
    color: COLORS[doc.clientID % COLORS.length]
  })

  const sendUpdate = (update, origin) => {
    if (origin !== REMOTE) socket.emit("yjs-update", { roomId, update })
  }
  const sendAwareness = ({ added, updated, removed }, origin) => {
    if (origin === REMOTE) return
    const changed = added.concat(updated, removed)
    socket.emit("awareness-update", { roomId, update: encodeAwarenessUpdate(awareness, changed) })
  }
  const receiveUpdate = ({ update }) => Y.applyUpdate(doc, new Uint8Array(update), REMOTE)
  const receiveAwareness = ({ update }) => applyAwarenessUpdate(awareness, new Uint8Array(update), REMOTE)

  doc.on("update", sendUpdate)
  awareness.on("update", sendAwareness)
  socket.on("yjs-update", receiveUpdate)
  socket.on("awareness-update", receiveAwareness)

  return {
    doc,
    text,
    awareness,
    // The server ignores awareness from sockets that haven't joined yet, so
    // this is sent again once the join succeeds.
    announce() {
      socket.emit("awareness-update", {
        roomId,
        update: encodeAwarenessUpdate(awareness, [doc.clientID])
      })
    },
    // Clears the text as one local edit, so it merges like any other.
    clear() {
      doc.transact(() => text.delete(0, text.length))
    },
    destroy() {
      removeAwarenessStates(awareness, [doc.clientID], "local")
      socket.off("yjs-update", receiveUpdate)
      socket.off("awareness-update", receiveAwareness)
      awareness.off("update", sendAwareness)
      doc.off("update", sendUpdate)
      awareness.destroy()
      doc.destroy()
    }
  }
}
