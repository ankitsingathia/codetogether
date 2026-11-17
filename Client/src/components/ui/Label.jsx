export function Label({ children, className = "", ...props }) {
  return (
    <label className={`block text-[13px] font-semibold text-ink mb-1.5 ${className}`} {...props}>
      {children}
    </label>
  )
}
