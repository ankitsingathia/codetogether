import { config } from "./src/config.js"
import { createServer } from "./src/server.js"

const { server, close } = createServer()

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${config.port} is already in use. Stop the process using this port and restart.`)
  } else {
    console.error("Server startup error:", error)
  }
  process.exit(1)
})

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Server running on ${config.backendUrl}:${config.port}`)
})

// Render and most hosts send SIGTERM before stopping an instance. Closing the
// sockets lets clients reconnect to another instance straight away.
process.on("SIGTERM", async () => {
  // If something still holds the process open, don't let a deploy wait on it.
  setTimeout(() => process.exit(1), 5000).unref()
  await close()
  process.exit(0)
})
