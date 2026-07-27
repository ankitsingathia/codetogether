export function Input({
  className = "",
  ...props
}) {
  return (
    <input
      autoComplete="off"
      spellCheck={false}
      className={`
        w-full rounded-md border border-gray-300
        bg-white text-gray-900
        px-3 py-2 text-sm
        placeholder-gray-400
        focus:outline-none focus:ring-2 focus:ring-blue-500
        dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100
        dark:placeholder-gray-500
        ${className}
      `}
      {...props}
    />
  )
}
