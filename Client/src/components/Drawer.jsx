import { useEffect } from "react"
import { X } from "lucide-react"
import { Button } from "./ui/Button"

// A panel that slides in from the right, so the code stays in view while
// you read a review or an answer. Escape or the backdrop closes it.
export function Drawer({ title, subtitle, actions, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/25 dark:bg-black/50" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="drawer-in relative flex h-full w-full max-w-[560px] flex-col border-l border-line bg-panel shadow-[-30px_0_60px_-30px_rgb(0_0_0/0.3)]"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-6 py-5">
          <div>
            <h2 className="font-display text-[20px] font-bold tracking-[-0.02em]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X />
            </Button>
          </div>
        </header>
        {children}
        {footer}
      </aside>
    </div>
  )
}
