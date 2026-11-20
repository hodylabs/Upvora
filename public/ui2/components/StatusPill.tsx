import "./ui.css"

import React from "react"
import { StatusInfo } from "../lib/status"

export const StatusPill = (props: { status: StatusInfo }) => (
  <span className={`u2-pill u2-pill--${props.status.tone}`} data-status={props.status.slug}>
    {props.status.label}
  </span>
)
