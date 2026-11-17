export function Input({ className = "", ...props }) {
  return (
    <input
      autoComplete="off"
      spellCheck={false}
      className={`
        h-11 w-full rounded-md border border-line bg-panel px-3 text-[15px] text-ink
        placeholder:text-muted/70
        transition-colors focus:border-cobalt focus:outline-none focus:ring-3 focus:ring-cobalt/15
        aria-[invalid=true]:border-danger
        ${className}
      `}
      {...props}
    />
  )
}
