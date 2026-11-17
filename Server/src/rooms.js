// Room state, held in memory. A room is created by its first member and
// removed when the last one leaves.
//
// The code lives in a Yjs document (a CRDT). Clients send the small edits they
// made, not the whole file, and every copy of the document merges the same set
// of edits into the same text whatever order they arrive in. That is what lets
// two people type at the same time without overwriting each other.
import * as Y from "yjs"
import { Awareness, removeAwarenessStates } from "y-protocols/awareness"

import { createMemory, deleteMemory, loadMemory } from "./ai/memory.js"

const TEMPLATES = {
  java: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello, World!");
  }
}`,
  python: `print("Hello, World!")`,
  cpp: `#include <iostream>
int main() {
  std::cout << "Hello, World!";
}`
}

export const LANGUAGES = Object.keys(TEMPLATES)

export function defaultCode(language) {
  return TEMPLATES[language]
}

const rooms = new Map()

export function getRoom(roomId) {
  return rooms.get(roomId)
}

export function getOrCreateRoom(roomId) {
  let room = rooms.get(roomId)
  if (!room) {
    room = createRoom(roomId)
    rooms.set(roomId, room)
  }
  return room
}

function createRoom(roomId) {
  const doc = new Y.Doc()
  doc.getText("code").insert(0, defaultCode("java"))

  // Awareness carries who is in the document and where their cursor is. It is
  // not part of the text, and entries expire if a client stops renewing them.
  const awareness = new Awareness(doc)
  awareness.setLocalState(null) // the server has no cursor of its own

  // Which socket owns which awareness client, so a socket that drops can have
  // its cursor removed for everyone.
  const awarenessOwners = new Map()
  awareness.on("update", ({ added }, origin) => {
    if (typeof origin === "string") for (const id of added) awarenessOwners.set(id, origin)
  })

  return {
    roomId,
    users: [],
    doc,
    awareness,
    awarenessOwners,
    language: "java",
    isRunning: false,
    runningBy: null,
    assistantMemory: loadMemory(roomId)
  }
}

export function codeOf(room) {
  return room.doc.getText("code").toString()
}

// Replaces the whole text (used when the language changes) and returns the
// Yjs update to send to every member.
export function replaceCode(room, code) {
  const before = Y.encodeStateVector(room.doc)
  const text = room.doc.getText("code")
  room.doc.transact(() => {
    text.delete(0, text.length)
    text.insert(0, code)
  }, "server")
  return Y.encodeStateAsUpdate(room.doc, before)
}

export function fullState(room) {
  return Y.encodeStateAsUpdate(room.doc)
}

export function isNameTaken(room, username) {
  const wanted = String(username).toLowerCase()
  return Boolean(room?.users.some((u) => u.username.toLowerCase() === wanted))
}

export function memberName(room, socketId) {
  return room?.users.find((u) => u.socketId === socketId)?.username
}

export function isMember(room, socketId) {
  return Boolean(room?.users.some((u) => u.socketId === socketId))
}

export function assistantMemory(room) {
  room.assistantMemory ||= createMemory()
  return room.assistantMemory
}

// Removes the socket from every room it was in, and its cursor with it.
// Returns [{ room, awarenessIds }] for the rooms it left; rooms that are now
// empty are deleted.
export function leaveAll(socketId) {
  const left = []
  for (const [roomId, room] of rooms) {
    const before = room.users.length
    room.users = room.users.filter((u) => u.socketId !== socketId)
    if (room.users.length === before) continue

    const awarenessIds = [...room.awarenessOwners]
      .filter(([, owner]) => owner === socketId)
      .map(([id]) => id)
    for (const id of awarenessIds) room.awarenessOwners.delete(id)
    removeAwarenessStates(room.awareness, awarenessIds, "server")
    left.push({ room, awarenessIds })

    if (room.users.length === 0) {
      room.awareness.destroy()
      room.doc.destroy()
      deleteMemory(roomId)
      rooms.delete(roomId)
    }
  }
  return left
}
