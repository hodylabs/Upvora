import "./feedback.css"
import React, { useEffect, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { i18n } from "@lingui/core"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

// Rendered and visible: no display:none on the element or an ancestor inside the dialog, and not
// visibility:hidden. Computed style rather than offsetParent, which is also null for fixed elements.
const isShown = (el: HTMLElement, root: HTMLElement) => {
  if (getComputedStyle(el).visibility === "hidden") return false
  for (let n: HTMLElement | null = el; n && n !== root; n = n.parentElement) {
    if (n.hidden || getComputedStyle(n).display === "none") return false
  }
  return true
}

const focusables = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[hidden]") && !el.closest('[aria-hidden="true"]') && isShown(el, root))

interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
  // When true, Esc and the backdrop do nothing (e.g. while a save is running).
  locked?: boolean
}

// A dialog in #root-modal: focus moves in when it opens, Tab and Shift+Tab stay inside,
// Esc or the backdrop closes it, and focus goes back to what opened it.
export const Modal = (props: ModalProps) => {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose
  const locked = useRef(props.locked)
  locked.current = props.locked

  useEffect(() => {
    if (!props.open) return
    const opener = document.activeElement as HTMLElement | null
    // Lock page scroll; restore the previous value (not "") so another modal's lock survives.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const dialog = ref.current
    if (dialog) {
      const first = focusables(dialog).find((el) => !el.classList.contains("u2-dlg__close"))
      ;(first || dialog).focus()
    }
    const onKey = (e: KeyboardEvent) => {
      if (!ref.current) return
      if (e.key === "Escape") {
        e.stopPropagation()
        if (!locked.current) onClose.current()
        return
      }
      if (e.key !== "Tab") return
      const items = focusables(ref.current)
      if (items.length === 0) {
        e.preventDefault()
        ref.current.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || !ref.current.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !ref.current.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", onKey, true)
    return () => {
      document.removeEventListener("keydown", onKey, true)
      document.body.style.overflow = prevOverflow
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [props.open])

  if (!props.open) return null

  const root = document.getElementById("root-modal") || document.body
  return createPortal(
    <div
      className="u2-dlg-back"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !props.locked) props.onClose()
      }}
    >
      <div ref={ref} className={props.wide ? "u2-dlg u2-dlg--wide" : "u2-dlg"} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="u2-dlg__head">
          <h2 id={titleId} className="u2-dlg__title">
            {props.title}
          </h2>
          <button
            type="button"
            className="u2-iconbtn u2-dlg__close"
            aria-label={i18n._({ id: "ui2.dialog.close", message: "Close" })}
            disabled={props.locked}
            onClick={props.onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="u2-dlg__body">{props.children}</div>
        {props.footer && <div className="u2-dlg__foot">{props.footer}</div>}
      </div>
    </div>,
    root
  )
}
