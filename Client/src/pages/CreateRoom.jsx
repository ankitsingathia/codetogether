import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Shuffle } from "lucide-react"
import { checkUsername, connectSocket } from "../lib/RoomSocket"
import { Button } from "../components/ui/Button"
import { Input } from "../components/ui/Input"
import { Label } from "../components/ui/Label"

// Same rules the server applies.
const ROOM_ID = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/
const USERNAME = /^[\p{L}\p{M}\p{N} _.-]{1,20}$/u

function generateRoomId() {
  const id = crypto.randomUUID().replace(/-/g, "")
  return `${id.slice(0, 3)}-${id.slice(3, 7)}-${id.slice(7, 10)}`
}

export default function CreateRoom() {
  const navigate = useNavigate()
  const location = useLocation()

  const [roomId, setRoomId] = useState(() => location.state?.roomId || (location.state?.newRoom ? generateRoomId() : ""))
  const [username, setUsername] = useState("")
  const [error, setError] = useState(null) // { field, message }
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    connectSocket()
  }, [])

  const handleJoin = async (e) => {
    e.preventDefault()
    setError(null)

    const id = roomId.trim().toLowerCase()
    const name = username.trim()

    if (!ROOM_ID.test(id)) {
      setError({ field: "roomId", message: "Room IDs look like abc-defg-hij. Paste the one you were sent, or make a new one." })
      return
    }
    if (!USERNAME.test(name)) {
      setError({ field: "username", message: "Use 1–20 letters, numbers, spaces, dots, dashes or underscores." })
      return
    }

    setChecking(true)
    const available = await checkUsername(id, name)
    setChecking(false)

    if (!available) {
      setError({ field: "username", message: `Someone in this room is already called ${name}. Pick another name.` })
      return
    }

    // The editor page does the actual join, once its shared document is
    // ready to receive the room's state.
    navigate(`/editor/${id}`, { state: { username: name } })
  }

  const newRoom = () => {
    setRoomId(generateRoomId())
    setError(null)
  }

  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-24 pt-10 sm:px-6 lg:grid-cols-[1fr_440px] lg:gap-20 lg:pt-20">
      <div className="max-w-md">
        <h1 className="font-display text-[40px] font-extrabold leading-[1] tracking-[-0.035em] sm:text-[48px]">
          Get into a room
        </h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          A room is one shared file. Anyone with its ID can join while someone is in it. When the last person leaves,
          the room and its code are cleared.
        </p>
        <p className="mt-4 text-[16px] leading-relaxed text-muted">
          Starting one? Make a new ID, join, then send the ID to the people you&rsquo;re coding with.
        </p>
      </div>

      <form onSubmit={handleJoin} noValidate className="rounded-xl border border-line bg-panel p-6 sm:p-7">
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="roomId">Room ID</Label>
            <button
              type="button"
              onClick={newRoom}
              className="flex items-center gap-1.5 rounded text-[13px] font-medium text-cobalt hover:underline"
            >
              <Shuffle className="size-3.5" />
              New ID
            </button>
          </div>
          <Input
            id="roomId"
            placeholder="abc-defg-hij"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            aria-invalid={error?.field === "roomId"}
            aria-describedby={error?.field === "roomId" ? "form-error" : undefined}
            className="font-mono text-[15px] tracking-[0.04em]"
          />
        </div>

        <div className="mt-5">
          <Label htmlFor="username">Your name</Label>
          <Input
            id="username"
            placeholder="How others see your cursor"
            maxLength={20}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={error?.field === "username"}
            aria-describedby={error?.field === "username" ? "form-error" : undefined}
          />
        </div>

        {error && (
          <p id="form-error" role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-[14px] text-danger">
            {error.message}
          </p>
        )}

        <Button type="submit" className="mt-6 w-full justify-center" disabled={checking}>
          {checking ? "Checking the name…" : "Join room"}
        </Button>
      </form>
    </section>
  )
}
