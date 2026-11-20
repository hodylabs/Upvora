import "./form.css"
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { Failure } from "@fider/services"

// Shows a server Failure ({ errors: [{ field?, message }] }) next to the right fields:
// each Field with a matching name shows its own messages, and the form's top box shows
// the general ones plus any whose field is not on screen, so no message is ever lost.

interface FormContextValue {
  errorsFor: (name?: string) => string[]
  clearError: (name: string) => void
  register: (name: string) => () => void
}

const FormContext = createContext<FormContextValue>({
  errorsFor: () => [],
  clearError: () => undefined,
  register: () => () => undefined,
})

export const useFormContext = () => useContext(FormContext)

// The messages a Failure holds for one field.
export const errorsFor = (error: Failure | undefined, name: string): string[] =>
  (error?.errors || []).filter((e) => !!name && e.field === name).map((e) => e.message)

// The messages no visible field will show: general ones and unknown fields.
export const unplacedErrors = (error: Failure | undefined, visible: string[]): string[] =>
  (error?.errors || []).filter((e) => !e.field || !visible.includes(e.field)).map((e) => e.message)

interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "onSubmit"> {
  error?: Failure
  onSubmit?: () => void | Promise<void>
  children: React.ReactNode
}

export const Form = ({ error, onSubmit, children, className, autoComplete = "off", ...rest }: FormProps) => {
  const [current, setCurrent] = useState<Failure | undefined>(error)
  const [names, setNames] = useState<string[]>([])

  useEffect(() => setCurrent(error), [error])

  const register = useCallback((name: string) => {
    setNames((n) => (n.includes(name) ? n : [...n, name]))
    return () => setNames((n) => n.filter((x) => x !== name))
  }, [])

  const clearError = useCallback((name: string) => {
    setCurrent((c) => {
      if (!c?.errors || !c.errors.some((e) => e.field === name)) return c
      return { errors: c.errors.filter((e) => e.field !== name) }
    })
  }, [])

  const ctx = useMemo<FormContextValue>(
    () => ({ errorsFor: (name) => (name ? errorsFor(current, name) : []), clearError, register }),
    [current, clearError, register]
  )

  const general = unplacedErrors(current, names)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // A form inside a dialog is portaled out of the DOM but React still bubbles its submit.
    e.stopPropagation()
    onSubmit?.()
  }

  return (
    <form {...rest} className={["u2-form", className].filter(Boolean).join(" ")} noValidate autoComplete={autoComplete} onSubmit={submit}>
      {general.length > 0 && (
        <div className="u2-form__error" role="alert">
          {general.length === 1 ? (
            general[0]
          ) : (
            <ul>
              {general.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <FormContext.Provider value={ctx}>{children}</FormContext.Provider>
    </form>
  )
}
