// Room members as a stack of initials. Each takes the colour of that
// person's cursor in the editor, so you can tell whose caret is whose.
const MAX_SHOWN = 4

export function Presence({ members, colors, me }) {
  const shown = members.slice(0, MAX_SHOWN)
  const extra = members.length - shown.length

  return (
    <div className="flex items-center gap-2.5">
      <ul className="flex items-center" aria-label="People in this room">
        {shown.map((m) => {
          const color = colors[m.username] || "var(--muted)"
          const isMe = m.username === me
          return (
            <li
              key={m.socketId}
              title={isMe ? `${m.username} (you)` : m.username}
              className="-ml-1.5 first:ml-0 grid size-7 place-items-center rounded-full text-[12px] font-semibold text-white ring-2 ring-panel"
              style={{ background: color }}
            >
              {m.username[0]?.toUpperCase()}
            </li>
          )
        })}
        {extra > 0 && (
          <li className="-ml-1.5 grid size-7 place-items-center rounded-full bg-sunk text-[11px] font-semibold text-muted ring-2 ring-panel">
            +{extra}
          </li>
        )}
      </ul>
      <span className="hidden md:inline text-[13px] text-muted">
        {members.length === 1 ? "Just you" : `${members.length} here`}
      </span>
    </div>
  )
}
