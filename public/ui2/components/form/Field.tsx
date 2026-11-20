import "./form.css"
import React, { useEffect, useId } from "react"
import { useFormContext } from "./Form"

// What a control needs to be wired to its field: id for the <label>, and the
// describedby/invalid pair so screen readers announce the hint and the error.
export interface ControlAttrs {
  id: string
  "aria-describedby"?: string
  "aria-invalid"?: true
}

interface FieldProps {
  // Matches the server's error field name; also clears that error on change.
  name?: string
  label: React.ReactNode
  hint?: React.ReactNode
  // "group" labels a set of controls (radios, toggles) instead of one input.
  group?: boolean
  stacked?: boolean
  // Extra messages from the page itself (e.g. "subdomain taken").
  errors?: string[]
  children: React.ReactNode | ((attrs: ControlAttrs) => React.ReactNode)
}

export const Field = (props: FieldProps) => {
  const ctx = useFormContext()
  const id = useId()
  const { name } = props
  useEffect(() => (name ? ctx.register(name) : undefined), [name, ctx.register])

  const errors = [...ctx.errorsFor(name), ...(props.errors || [])]
  const hintId = props.hint ? `${id}-hint` : undefined
  const errorId = errors.length ? `${id}-err` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined
  const attrs: ControlAttrs = { id: `${id}-ctl`, "aria-describedby": describedBy, "aria-invalid": errors.length ? true : undefined }
  const labelId = `${id}-label`

  const label = props.group ? (
    <span id={labelId} className="u2-fld__label">
      {props.label}
    </span>
  ) : (
    <label id={labelId} htmlFor={attrs.id} className="u2-fld__label">
      {props.label}
    </label>
  )

  return (
    <div className={props.stacked ? "u2-fld u2-fld--stacked" : "u2-fld"}>
      <div>
        {label}
        {props.hint && (
          <span id={hintId} className="u2-fld__hint">
            {props.hint}
          </span>
        )}
      </div>
      <div
        className="u2-fld__body"
        role={props.group ? "group" : undefined}
        aria-labelledby={props.group ? labelId : undefined}
        aria-describedby={props.group ? describedBy : undefined}
      >
        {typeof props.children === "function" ? props.children(attrs) : props.children}
        {errorId && (
          <div id={errorId} className="u2-fld__error" role="alert">
            {errors.map((m) => (
              <p key={m}>{m}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
