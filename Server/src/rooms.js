// Room state, held in memory. A room is created by its first member and
// removed when the last one leaves.
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
    room = {
      roomId,
      users: [],
      code: defaultCode("java"),
      language: "java",
      isRunning: false,
      runningBy: null,
      assistantMemory: loadMemory(roomId)
    }
    rooms.set(roomId, room)
  }
  return room
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

// Removes the socket from every room it was in. Returns the rooms it left,
// and deletes rooms that are now empty.
export function leaveAll(socketId) {
  const left = []
  for (const [roomId, room] of rooms) {
    const before = room.users.length
    room.users = room.users.filter((u) => u.socketId !== socketId)
    if (room.users.length === before) continue

    left.push(room)
    if (room.users.length === 0) {
      deleteMemory(roomId)
      rooms.delete(roomId)
    }
  }
  return left
}
