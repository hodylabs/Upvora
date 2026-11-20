import "./form.css"
import React, { useLayoutEffect, useRef } from "react"
import { Field } from "./Field"
import { useFormContext } from "./Form"

interface CommonProps {
  name: string
  label: React.ReactNode
  hint?: React.ReactNode
  stacked?: boolean
  errors?: string[]
  // Rendered after the control inside the field (buttons, notes).
  after?: React.ReactNode
}

type InputProps = CommonProps &
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "onChange" | "value"> & {
    value: string
    onChange: (value: string) => void
    // Text joined to the end of the input, e.g. ".upvora.app" after a subdomain.
    suffix?: React.ReactNode
    inputRef?: React.Ref<HTMLInputElement>
  }

export const TextInput = ({ name, label, hint, stacked, errors, after, value, onChange, suffix, inputRef, type = "text", ...rest }: InputProps) => {
  const { clearError } = useFormContext()
  return (
    <Field name={name} label={label} hint={hint} stacked={stacked} errors={errors}>
      {(a) => {
        const input = (
          <input
            {...rest}
            {...a}
            ref={inputRef}
            name={name}
            type={type}
            className="u2-ctl"
            value={value}
            onChange={(e) => {
              clearError(name)
              onChange(e.target.value)
            }}
          />
        )
        return (
          <>
            {suffix ? (
              <div className="u2-affix">
                {input}
                <span className="u2-affix__end">{suffix}</span>
              </div>
            ) : (
              input
            )}
            {after}
          </>
        )
      }}
    </Field>
  )
}

type TextAreaProps = CommonProps &
  Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "name" | "onChange" | "value"> & {
    value: string
    onChange: (value: string) => void
  }

// Grows with its content (up to the CSS max), so long text never hides behind a scrollbar.
export const TextArea = ({ name, label, hint, stacked, errors, after, value, onChange, rows = 3, ...rest }: TextAreaProps) => {
  const { clearError } = useFormContext()
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight + 2}px`
  }, [value])
  return (
    <Field name={name} label={label} hint={hint} stacked={stacked} errors={errors}>
      {(a) => (
        <>
          <textarea
            {...rest}
            {...a}
            ref={ref}
            name={name}
            rows={rows}
            className="u2-ctl"
            value={value}
            onChange={(e) => {
              clearError(name)
              onChange(e.target.value)
            }}
          />
          {after}
        </>
      )}
    </Field>
  )
}

export interface SelectOption {
  value: string
  label: string
}

type SelectProps = CommonProps &
  Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "name" | "onChange" | "value"> & {
    value: string
    options: SelectOption[]
    onChange: (value: string) => void
  }

export const Select = ({ name, label, hint, stacked, errors, after, value, options, onChange, ...rest }: SelectProps) => {
  const { clearError } = useFormContext()
  return (
    <Field name={name} label={label} hint={hint} stacked={stacked} errors={errors}>
      {(a) => (
        <>
          <select
            {...rest}
            {...a}
            name={name}
            className="u2-ctl"
            value={value}
            onChange={(e) => {
              clearError(name)
              onChange(e.target.value)
            }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {after}
        </>
      )}
    </Field>
  )
}
