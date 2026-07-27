function getColor(name) {
  const colors = [
    "bg-blue-500",
    "bg-green-500",
    "bg-purple-500",
    "bg-pink-500",
    "bg-yellow-500",
  ]
  return colors[name.charCodeAt(0) % colors.length]
}

export function Client({ name }) {
  return (
    <li className="flex items-center gap-2">
      <div
        className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${getColor(name)}`}
      >
        {name[0].toUpperCase()}
      </div>
      <span className="text-sm truncate">{name}</span>
    </li>
  )
}
