import { useEffect, useRef } from "react"

export interface RowKeyHandlers {
  count: number
  focused: number // -1: no row focused yet
  setFocused: (index: number) => void
  onVote: (index: number) => void
  onOpen: (index: number) => void
  onMerge?: (index: number) => void // staff only; leave out for everyone else
  onEscape?: () => void
}

// True when the key press belongs to a field the person is typing in.
export const isTypingTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  return tag === "input" || tag === "textarea" || tag === "select" || !!el.isContentEditable
}

// Board keys: J/K move the focused row, V votes on it, Enter opens it, M opens merge
// (staff), Esc closes the peek or menus. Keys never fire while typing in a field.
export const useRowKeys = (h: RowKeyHandlers) => {
  const ref = useRef(h)
  ref.current = h

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = ref.current
      if (e.key === "Escape") {
        cur.onEscape?.()
        return
      }
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      // Enter on a link or button already does its own thing.
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase()
      if (e.key === "Enter" && (tag === "a" || tag === "button")) return
      if (cur.count === 0) return
      const key = e.key.toLowerCase()
      if (key === "j") {
        cur.setFocused(Math.min(cur.count - 1, cur.focused + 1))
      } else if (key === "k") {
        cur.setFocused(Math.max(0, cur.focused - 1))
      } else if (cur.focused < 0 || cur.focused >= cur.count) {
        return
      } else if (key === "v") {
        cur.onVote(cur.focused)
      } else if (e.key === "Enter") {
        cur.onOpen(cur.focused)
      } else if (key === "m" && cur.onMerge) {
        cur.onMerge(cur.focused)
      } else {
        return
      }
      e.preventDefault()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])
}
