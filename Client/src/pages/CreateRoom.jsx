import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { connectSocket, checkUsername, onJoinError, joinRoom, onJoinSuccess } from "../lib/RoomSocket"
import { Button } from "./../components/ui/Button"
import { Input } from "./../components/ui/Input"
import { Label } from "./../components/ui/Lebel"

const ROOM_ID_REGEX = /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/i

function generateRoomId() {
  const id = crypto.randomUUID().replace(/-/g, "")
  return `${id.slice(0, 3)}-${id.slice(3, 7)}-${id.slice(7, 10)}`
}

export default function CreateRoom() {
  const navigate = useNavigate()

  useEffect(() => {
    connectSocket()
  }, [])

  const [roomId, setRoomId] = useState("")
  const [username, setUsername] = useState("")
  const [error, setError] = useState("")
  // const [checking, setChecking] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleJoin = async (e) => {
    e.preventDefault()
    setError("")

    if (!roomId || !username) return



    // Invalid format → regenerate & stop
    if (!ROOM_ID_REGEX.test(roomId)) {
      const newId = generateRoomId()
      setRoomId(newId)
      setError("Invalid Room ID format. A new one has been generated. Click Join again.")
      return
    }


    const available = await checkUsername(roomId, username)


    if (!available) {
      setError("Username already taken. Choose another.")
      return
    }

    setLoading(true)


    joinRoom(roomId, username)

    onJoinSuccess(({ roomId }) => {
      setLoading(false)
      navigate(`/editor/${roomId}`, {
        state: { username }
      })
    })

    onJoinError(({ message }) => {
      setLoading(false)
      setError(message)
    })

  }

  const handleCreateRoom = () => {
    setRoomId(generateRoomId())
    setError("")
  }

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <form
        onSubmit={handleJoin}
        className="w-full max-w-md border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-6 bg-white dark:bg-gray-900"
      >
        <h1 className="text-xl font-semibold text-center">
          Join a Room
        </h1>

        <div className="space-y-2">
          <Label htmlFor="roomId">Room ID</Label>
          <Input
            id="roomId"
            required
            placeholder="e19-412c-3f7"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username">Your Name</Label>
          <Input
            id="username"
            required
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-blue-600 dark:text-blue-400">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full">
          {loading ? (
            <p className="text-sm text-gray-500 text-center">
              Connecting to room...
            </p>
          ) : "Join Room"}
        </Button>

        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          Don’t have a room ID?{" "}
          <button
            type="button"
            onClick={handleCreateRoom}
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Create New Room
          </button>
        </div>
      </form>
    </div>
  )
}
