import { Outlet } from "react-router-dom"

// The editor draws its own top bar, so it gets the whole screen.
export default function EditorLayout() {
  return (
    <div className="h-dvh overflow-hidden bg-paper text-ink">
      <Outlet />
    </div>
  )
}
