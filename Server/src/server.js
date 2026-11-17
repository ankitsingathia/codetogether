import os from "os"
import cors from "cors"
import express from "express"
import http from "http"
import { Redis } from "ioredis"
import { Server } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"

import { config } from "./config.js"
import { corsOptions, createOriginCheck } from "./cors.js"
import { createRooms } from "./rooms.js"
import { registerAssistantHandlers } from "./sockets/assistant.js"
import { registerExecutionHandlers, stopRunsFor } from "./sockets/execution.js"
import { registerRoomHandlers } from "./sockets/room.js"
import { createMemoryStore } from "./store/memory.js"
import { createRedisStore } from "./store/redis.js"

export function createServer({ redisUrl = config.redisUrl } = {}) {
  const allowOrigin = createOriginCheck(config.frontendOrigins)
  const instance = process.env.INSTANCE_NAME || `${os.hostname()}-${process.pid}`

  const app = express()
  app.use(cors(corsOptions(allowOrigin)))
  app.get("/", (req, res) => {
    res.status(200).send("CodeTogether backend is running.")
  })

  const server = http.createServer(app)
  const io = new Server(server, { cors: corsOptions(allowOrigin) })

  // With Redis, every instance shares rooms: the adapter carries broadcasts
  // and server-to-server messages, and the store holds room state. Three
  // connections, because a subscriber connection can't run other commands.
  const redisClients = []
  let store
  if (redisUrl) {
    const connect = () => {
      const client = new Redis(redisUrl, { maxRetriesPerRequest: 3 })
      client.on("error", (error) => console.error("Redis:", error.message))
      redisClients.push(client)
      return client
    }
    io.adapter(createAdapter(connect(), connect()))
    store = createRedisStore(connect())
  } else {
    store = createMemoryStore()
  }

  const rooms = createRooms({ io, store, cluster: Boolean(redisUrl) })

  // Which instance answered, and whether rooms are shared. Handy behind a
  // load balancer.
  app.get("/health", (req, res) => {
    res.json({ ok: true, instance, store: store.kind })
  })

  io.on("connection", (socket) => {
    registerRoomHandlers(io, socket, { rooms, store, onLeave: stopRunsFor })
    registerExecutionHandlers(io, socket, { rooms, store })
    registerAssistantHandlers(io, socket, { rooms, store })
  })

  async function close() {
    io.close()
    await Promise.allSettled(redisClients.map((client) => client.quit()))
  }

  return { app, server, io, close, store }
}
