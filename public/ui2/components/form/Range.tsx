import "./form.css"
import React from "react"

interface RangeProps {
  // Pair with a <label htmlFor={id}>: the label is the control's accessible name.
  id: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  className?: string
}

// A native range input (drag, click, keyboard, screen readers) over a drawn track:
// a glowing fill up to the thumb and a dot at each step that lights once passed.
export const Range = ({ id, min, max, step = 1, value, onChange, disabled, className }: RangeProps) => {
  const span = max - min || 1
  const stops: number[] = []
  for (let n = min; n <= max; n += step) stops.push(n)
  return (
    <div
      className={["u2-range", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ")}
      style={{ "--f": (value - min) / span } as React.CSSProperties}
    >
      <div className="u2-range__track" aria-hidden="true">
        {stops.map((n) => (
          <i key={n} className={n <= value ? "is-on" : undefined} style={{ "--s": (n - min) / span } as React.CSSProperties} />
        ))}
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}
