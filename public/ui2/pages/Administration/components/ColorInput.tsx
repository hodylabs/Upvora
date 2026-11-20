import "./groupB.css"
import React, { useEffect, useState } from "react"
import { i18n } from "@lingui/core"

// #rgb or #rrggbb, as classic's ColorInput and the server accept.
export const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

// Normalizes typed text the way classic does: trims and adds a missing "#".
export const normalizeHex = (raw: string): string => {
  const v = raw.trim()
  return v !== "" && !v.startsWith("#") ? "#" + v : v
}

export const isHex = (value: string): boolean => HEX_RE.test(value)

// #abc -> #aabbcc, for <input type="color"> which only takes six digits.
export const expandHex = (hex: string): string => (hex.length === 4 ? "#" + [...hex.slice(1)].map((c) => c + c).join("") : hex)

interface ColorInputProps {
  value: string
  onChange: (hex: string) => void
  // Accessible name prefix, e.g. "Links" -> "Links color" / "Links hex color".
  label?: string
  disabled?: boolean
}

// Native color picker plus a hex text field, two-way synced (the OS dialog does not
// always offer hex entry). Only valid hex reaches onChange, lower-cased; an invalid
// entry is marked and explained, and the last valid color stays in effect.
export const ColorInput = (props: ColorInputProps) => {
  const [text, setText] = useState(props.value)
  useEffect(() => setText(props.value), [props.value])

  const valid = isHex(text)
  const name = props.label ? `${props.label} ` : ""
  const errId = `u2-hex-${(props.label || "c").replace(/\W+/g, "-")}-err`

  return (
    <span className="u2-color">
      <input
        type="color"
        className="u2-color__pick"
        disabled={props.disabled}
        value={expandHex(valid ? text : props.value)}
        onChange={(e) => {
          setText(e.target.value)
          props.onChange(e.target.value)
        }}
        aria-label={name + i18n._({ id: "ui2.admin.color.pick", message: "Pick a color" })}
      />
      <input
        type="text"
        className="u2-ctl u2-color__hex"
        value={text}
        disabled={props.disabled}
        maxLength={7}
        spellCheck={false}
        placeholder="#3B82F6"
        aria-label={name + i18n._({ id: "ui2.admin.color.hex", message: "Hex color" })}
        aria-invalid={valid ? undefined : true}
        aria-describedby={valid ? undefined : errId}
        onChange={(e) => {
          const v = normalizeHex(e.target.value)
          setText(v)
          if (isHex(v)) props.onChange(v.toLowerCase())
        }}
      />
      {!valid && (
        <span id={errId} className="u2-fld__error" role="alert">
          {i18n._({ id: "ui2.admin.color.invalid", message: "Use #RGB or #RRGGBB." })}
        </span>
      )}
    </span>
  )
}
