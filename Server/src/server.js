import cors from "cors"
import express from "express"
import http from "http"
import { Server } from "socket.io"

import { config } from "./config.js"
import { corsOptions, createOriginCheck } from "./cors.js"
import { registerAssistantHandlers } from "./sockets/assistant.js"
import { registerExecutionHandlers, stopRunsFor } from "./sockets/execution.js"
import { registerRoomHandlers } from "./sockets/room.js"

export function createServer() {
  const allowOrigin = createOriginCheck(config.frontendOrigins)

  const app = express()
  app.use(cors(corsOptions(allowOrigin)))
  app.get("/", (req, res) => {
    res.status(200).send("CodeTogether backend is running.")
  })

  const server = http.createServer(app)
  const io = new Server(server, { cors: corsOptions(allowOrigin) })

  io.on("connection", (socket) => {
    registerRoomHandlers(io, socket, { onLeave: stopRunsFor })
    registerExecutionHandlers(io, socket)
    registerAssistantHandlers(io, socket)
  })

  return { app, server, io }
}
