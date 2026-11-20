import "./form.css"
import React from "react"

export type ButtonVariant = "primary" | "secondary" | "danger" | "danger-solid" | "ghost"

const variantClass: Record<ButtonVariant, string> = {
  primary: "u2-btn--primary",
  secondary: "u2-btn--secondary",
  danger: "u2-btn--danger",
  "danger-solid": "u2-btn--danger-solid",
  ghost: "u2-btn--ghost",
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  small?: boolean
  block?: boolean
  // Shows a spinner, sets aria-busy and blocks clicks until the work is done.
  loading?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", small, block, loading, className, disabled, children, type = "button", ...rest },
  ref
) {
  const cls = ["u2-btn", variantClass[variant], small && "u2-btn--small", block && "u2-btn--block", className].filter(Boolean).join(" ")
  return (
    <button {...rest} ref={ref} type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined}>
      {loading && <span className="u2-spin" aria-hidden="true" />}
      {children}
    </button>
  )
})

interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  // Required: an icon-only button has no visible text, so this is its accessible name.
  label: string
  variant?: ButtonVariant
  small?: boolean
  loading?: boolean
  children: React.ReactNode
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, className, ...rest }, ref) {
  return <Button {...rest} ref={ref} className={["u2-btn--icon", className].filter(Boolean).join(" ")} aria-label={label} title={label} />
})
