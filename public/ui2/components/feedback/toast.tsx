import "./feedback.css"
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { i18n } from "@lingui/core"

// Small toasts for the new UI. The host mounts itself on first use in its own element,
// #root-u2-toast, next to #root-toastify (classic notifications create their own React root
// on that element and would wipe anything inside it), so no page or shell wiring is needed.

type Kind = "success" | "error"
interface Toast {
  id: number
  kind: Kind
  message: string
}

const DURATION = 5000
let nextId = 1
let items: Toast[] = []
const listeners = new Set<(t: Toast[]) => void>()
let host: HTMLElement | null = null

const emit = () => listeners.forEach((l) => l(items))

export const dismissToast = (id: number) => {
  items = items.filter((t) => t.id !== id)
  emit()
}

const ToastHost = () => {
  // Starts empty so the live region is announced as changing when the first message lands.
  const [list, setList] = useState<Toast[]>([])
  useEffect(() => {
    listeners.add(setList)
    setList(items) // catch anything shown between the first render and this subscription
    return () => {
      listeners.delete(setList)
    }
  }, [])
  const closeLabel = i18n._({ id: "ui2.toast.dismiss", message: "Dismiss" })
  return (
    <>
      {list.map((t) => (
        <li key={t.id} className={t.kind === "error" ? "u2-toast u2-toast--error" : "u2-toast"}>
          <svg className="u2-toast__icon" viewBox="0 0 24 24" aria-hidden="true">
            {t.kind === "error" ? (
              <path d="M12 8v5M12 16.5v.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
            ) : (
              <path d="M8 12.5l2.5 2.5L16 9.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />
            )}
          </svg>
          <span className="u2-toast__msg">{t.message}</span>
          <button type="button" className="u2-iconbtn" aria-label={closeLabel} onClick={() => dismissToast(t.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </li>
      ))}
    </>
  )
}

const mount = () => {
  if (host && host.isConnected) return
  // The status region is plain DOM, attached empty and synchronously, so it is in the page
  // before React renders any message into it.
  const el = document.createElement("ul")
  el.id = "root-u2-toast"
  el.className = "u2-toasts"
  el.setAttribute("role", "status")
  el.setAttribute("aria-live", "polite")
  const classic = document.getElementById("root-toastify")
  if (classic) classic.after(el)
  else document.body.appendChild(el)
  host = el
  createRoot(el).render(<ToastHost />)
}

const show = (kind: Kind, message: string) => {
  mount()
  const id = nextId++
  items = [...items, { id, kind, message }]
  emit()
  window.setTimeout(() => dismissToast(id), DURATION)
  return id
}

export const toast = {
  success: (message: string) => show("success", message),
  error: (message: string) => show("error", message),
}
