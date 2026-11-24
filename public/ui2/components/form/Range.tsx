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

// A rating as segments (min+1..max) that fill up to the value. A native range input,
// visually hidden, carries keyboard and screen reader use (arrows, Home/End); the
// segments are the pointer target: tap one to set it, tap the current one to clear.
export const Range = ({ id, min, max, step = 1, value, onChange, disabled, className }: RangeProps) => {
  const steps: number[] = []
  for (let n = min + step; n <= max; n += step) steps.push(n)
  return (
    <div className={["u2-range", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ")}>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="u2-range__segs" aria-hidden="true">
        {steps.map((n) => (
          <span key={n} className={n <= value ? "is-on" : undefined} onClick={() => !disabled && onChange(n === value ? min : n)}>
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
