import "./ui.css"

import React from "react"
import { Voter } from "../lib/insights"

// Up to `max` voter faces; the names go in the accessible label.
export const AvatarStack = (props: { voters?: Voter[]; max?: number }) => {
  const voters = (props.voters || []).slice(0, props.max || 3)
  if (voters.length === 0) return null
  const names = voters.map((v) => v.name).join(", ")
  return (
    <span className="u2-faces" role="img" aria-label={names} title={names}>
      {voters.map((v, i) => (
        <img key={i} src={v.avatarURL} alt="" width={20} height={20} loading="lazy" />
      ))}
    </span>
  )
}
