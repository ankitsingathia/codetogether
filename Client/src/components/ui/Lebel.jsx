export function Label({
  children,
  className = "",
  ...props
}) {
  return (
    <label
      className={`block text-sm font-medium text-[var(--text-secondary)] mb-1.5 ${className}`}
      {...props}
    >
      {children}
    </label>
  )
}
