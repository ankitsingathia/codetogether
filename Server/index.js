import { config } from "./src/config.js"
import { createServer } from "./src/server.js"

const { server } = createServer()

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
