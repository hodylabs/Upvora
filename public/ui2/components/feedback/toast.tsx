import "./feedback.css"
import React, { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"
import { i18n } from "@lingui/core"

// Small toasts for the new UI. The host mounts itself on first use in its own element
// inside #root-toastify (classic's react-toastify, which the shared http layer still
// calls on server errors, keeps the container itself), so no page or shell wiring is needed.

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
let mounted = false

const emit = () => listeners.forEach((l) => l(items))

export const dismissToast = (id: number) => {
  items = items.filter((t) => t.id !== id)
  emit()
}

const ToastHost = () => {
  const [list, setList] = useState<Toast[]>(items)
  useEffect(() => {
    listeners.add(setList)
    return () => {
      listeners.delete(setList)
    }
  }, [])
  const closeLabel = i18n._({ id: "ui2.toast.dismiss", message: "Dismiss" })
  return (
    <ul className="u2-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <li key={t.id} className={t.kind === "error" ? "u2-toast u2-toast--error" : "u2-toast"}>
          <span className="u2-toast__msg">{t.message}</span>
          <button type="button" className="u2-iconbtn" aria-label={closeLabel} onClick={() => dismissToast(t.id)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </li>
      ))}
    </ul>
  )
}

const mount = () => {
  if (mounted) return
  mounted = true
  const parent = document.getElementById("root-toastify") || document.body
  const el = document.createElement("div")
  el.className = "u2-toast-host"
  parent.appendChild(el)
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
