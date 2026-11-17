import dotenv from "dotenv"

dotenv.config()

export const config = {
  port: Number(process.env.PORT) || 3001,
  backendUrl: process.env.BACKEND_URL || "http://localhost",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  // Comma-separated list of extra browser origins allowed to connect.
  frontendOrigins: [process.env.FRONTEND_ORIGIN, process.env.FRONTEND_ORIGINS]
    .filter(Boolean)
    .join(",")
}
