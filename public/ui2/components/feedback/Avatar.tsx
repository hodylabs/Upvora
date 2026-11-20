import "./feedback.css"
import React from "react"

interface AvatarProps {
  name: string
  // The server's avatarURL (letter, Gravatar or custom); falls back to the initial.
  src?: string
  size?: number
  // Decorative next to a visible name (the default); set when the avatar stands alone.
  labelled?: boolean
}

export const Avatar = ({ name, src, size = 28, labelled }: AvatarProps) => {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.45) }
  if (src) {
    return <img className="u2-avatar" src={src} alt={labelled ? name : ""} width={size} height={size} style={style} />
  }
  return (
    <span
      className="u2-avatar"
      style={style}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  )
}
