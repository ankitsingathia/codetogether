// Which browser origins may use the HTTP API and open a socket.

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/$/, "").toLowerCase()
}

export function createOriginCheck(configuredList = "") {
  const configured = new Set(
    configuredList.split(",").map(normalizeOrigin).filter(Boolean)
  )

  return function isAllowedOrigin(origin) {
    // Non-browser clients (tests, curl) send no Origin header.
    if (!origin) return true
    if (configured.has(normalizeOrigin(origin))) return true
    if (/^https?:\/\/localhost:\d+$/i.test(origin)) return true
    // Secure DuckDNS origins used by the production deployment.
    if (/^https:\/\/[a-z0-9-]+\.duckdns\.org$/i.test(origin)) return true
    return false
  }
}

export function corsOptions(isAllowedOrigin) {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true)
      return callback(new Error("Not allowed by CORS"))
    },
    methods: ["GET", "POST"],
    credentials: true
  }
}
