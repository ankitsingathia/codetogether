const variants = {
  primary: `
    bg-blue-600 text-white
    hover:bg-blue-700
    active:bg-blue-800
    focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
    dark:bg-blue-500
    dark:hover:bg-blue-600
    dark:active:bg-blue-700
  `,
  outline: `
    border border-gray-300 text-gray-900
    hover:bg-gray-100
    active:bg-gray-200
    focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2
    dark:border-gray-600 dark:text-gray-100
    dark:hover:bg-gray-800
    dark:active:bg-gray-700
  `,
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}) {
  return (
    <button
      className={`
        px-4 py-2 rounded-md text-sm font-medium
        transition-colors duration-150
        focus-visible:outline-none
        disabled:opacity-50 disabled:pointer-events-none
        ${variants[variant]}
        ${className}
      `}
      {...props}
    />
  )
}
