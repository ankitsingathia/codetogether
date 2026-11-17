import { Link } from "react-router-dom"

// Two named cursors: the product in one mark.
export function BrandMark({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="4" y="3" width="2.5" height="17" rx="1" fill="var(--marigold)" />
      <rect x="4" y="3" width="7" height="4.5" rx="1" fill="var(--marigold)" />
      <rect x="14" y="6" width="2.5" height="15" rx="1" fill="var(--cobalt)" />
      <rect x="14" y="6" width="6.5" height="4.5" rx="1" fill="var(--cobalt)" />
    </svg>
  )
}

export function Brand({ compact = false }) {
  return (
    <Link to="/" className="flex items-center gap-2 rounded-md text-ink" aria-label="CodeTogether home">
      <BrandMark />
      <span className={`font-display font-bold tracking-[-0.02em] ${compact ? "hidden sm:inline text-[15px]" : "text-[17px]"}`}>
        codetogether
      </span>
    </Link>
  )
}
