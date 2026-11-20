import "./form.css"
import React from "react"

interface RangeProps {
  // Pair with a <label htmlFor={id}>: the label is the slider's accessible name.
  id: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  // Numbers under the track at each step (decorative; the slider announces its own value).
  ticks?: boolean
  className?: string
}

// A native range input: arrow keys, Home/End and Page keys work for free.
export const Range = ({ id, min, max, step = 1, value, onChange, disabled, ticks, className }: RangeProps) => {
  const marks: number[] = []
  if (ticks) for (let n = min; n <= max; n += step) marks.push(n)
  return (
    <div className={["u2-range", className].filter(Boolean).join(" ")}>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      {ticks && (
        <div className="u2-range__ticks u2-mono" aria-hidden="true">
          {marks.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      )}
    </div>
  )
}
