import dotenv from "dotenv"

dotenv.config()

export const config = {
  port: Number(process.env.PORT) || 3001,
  backendUrl: process.env.BACKEND_URL || "http://localhost",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // Set to run several server instances that share rooms. Without it, rooms
  // live in this process and one server is all there is.
  redisUrl: process.env.REDIS_URL || "",
  // Comma-separated list of extra browser origins allowed to connect.
  frontendOrigins: [process.env.FRONTEND_ORIGIN, process.env.FRONTEND_ORIGINS]
    .filter(Boolean)
    .join(",")
}
