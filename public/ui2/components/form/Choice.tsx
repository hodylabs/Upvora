import "./form.css"
import React, { useId } from "react"

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  // Visible text, which is also the switch's accessible name.
  label: React.ReactNode
  // Use when the label must be hidden (e.g. a table cell already says what it is).
  hideLabel?: boolean
  disabled?: boolean
  id?: string
}

// A real button with role="switch": Space and Enter flip it, and screen readers
// announce "on" or "off" from aria-checked.
export const Toggle = (props: ToggleProps) => (
  <button
    type="button"
    id={props.id}
    role="switch"
    aria-checked={props.checked}
    className="u2-switch"
    disabled={props.disabled}
    onClick={() => props.onChange(!props.checked)}
  >
    <span className="u2-switch__track" aria-hidden="true" />
    <span className={props.hideLabel ? "u2-vh" : undefined}>{props.label}</span>
  </button>
)

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  hint?: React.ReactNode
  name?: string
  disabled?: boolean
}

export const Checkbox = (props: CheckboxProps) => {
  const id = useId()
  return (
    <label className="u2-choice" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        name={props.name}
        checked={props.checked}
        disabled={props.disabled}
        aria-describedby={props.hint ? `${id}-hint` : undefined}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>
        {props.label}
        {props.hint && (
          <span id={`${id}-hint`} className="u2-choice__hint">
            {props.hint}
          </span>
        )}
      </span>
    </label>
  )
}

export interface RadioOption<T extends string> {
  value: T
  label: React.ReactNode
  hint?: React.ReactNode
}

interface RadioGroupProps<T extends string> {
  name: string
  value: T
  options: RadioOption<T>[]
  onChange: (value: T) => void
  // The group's accessible name when it is not inside a labelled Field group.
  legend?: string
  // Bordered cards in a row (e.g. the theme picker) instead of a plain list.
  cards?: boolean
  disabled?: boolean
}

// Native radios: arrow keys move within the group for free.
export const RadioGroup = <T extends string>(props: RadioGroupProps<T>) => {
  const id = useId()
  return (
    <div className={props.cards ? "u2-radios u2-radios--cards" : "u2-radios"} role="radiogroup" aria-label={props.legend}>
      {props.options.map((o) => (
        <label key={o.value} className="u2-choice" htmlFor={`${id}-${o.value}`}>
          <input
            id={`${id}-${o.value}`}
            type="radio"
            name={props.name}
            value={o.value}
            checked={props.value === o.value}
            disabled={props.disabled}
            onChange={() => props.onChange(o.value)}
          />
          <span>
            {o.label}
            {o.hint && <span className="u2-choice__hint">{o.hint}</span>}
          </span>
        </label>
      ))}
    </div>
  )
}
