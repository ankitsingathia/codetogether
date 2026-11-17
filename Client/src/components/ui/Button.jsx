import { Link } from "react-router-dom"

const variants = {
  primary: "bg-cobalt text-on-accent hover:brightness-110 active:brightness-95 shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]",
  run: "bg-moss text-on-accent hover:brightness-110 active:brightness-95 shadow-[inset_0_-1px_0_rgb(0_0_0/0.15)]",
  quiet: "bg-panel text-ink border border-line hover:bg-sunk active:bg-paper",
  ghost: "text-muted hover:text-ink hover:bg-sunk",
}

const sizes = {
  md: "h-10 px-4 text-[15px] gap-2",
  sm: "h-8 px-3 text-[13px] gap-1.5",
  icon: "h-8 w-8 justify-center",
}

function buttonClass({ variant = "primary", size = "md", className = "" } = {}) {
  return [
    "inline-flex items-center rounded-md font-medium whitespace-nowrap select-none",
    "transition-[background-color,filter,color] duration-150",
    "disabled:opacity-50 disabled:pointer-events-none",
    "[&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  ].join(" ")
}

// A button, or a link styled as one when `to` is given.
export function Button({ variant, size, className, to, ...props }) {
  const cls = buttonClass({ variant, size, className })
  if (to) {
    const external = /^https?:/.test(to)
    return external
      ? <a href={to} target="_blank" rel="noreferrer" className={cls} {...props} />
      : <Link to={to} className={cls} {...props} />
  }
  return <button type="button" className={cls} {...props} />
}
