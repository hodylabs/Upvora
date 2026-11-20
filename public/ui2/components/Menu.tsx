import React, { useEffect, useRef, useState } from "react"

export interface MenuItem {
  key: string
  label: React.ReactNode
  // A link item; otherwise onSelect runs.
  href?: string
  onSelect?: () => void
}

interface MenuProps {
  items: MenuItem[]
  // The trigger button's content and, when that is not text enough, its accessible name.
  trigger: React.ReactNode
  triggerLabel?: string
  className?: string
  triggerClassName?: string
  listClassName?: string
}

// The menu button pattern: the trigger opens a list of menu items; arrow keys, Home and
// End move through it, Enter picks, Esc closes and puts focus back on the trigger, Tab
// or a click outside closes it.
export const Menu = (props: MenuProps) => {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const startAtEnd = useRef(false)

  const items = () => Array.from(wrap.current?.querySelectorAll<HTMLElement>("[role=menuitem]") || [])

  useEffect(() => {
    if (!open) return
    const list = items()
    list[startAtEnd.current ? list.length - 1 : 0]?.focus()
    startAtEnd.current = false
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.target === trigger.current && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault()
        startAtEnd.current = e.key === "ArrowUp"
        setOpen(true)
      }
      return
    }
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLElement)
    if (e.key === "Escape") {
      e.stopPropagation()
      close()
    } else if (e.key === "Tab") {
      setOpen(false)
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const step = e.key === "ArrowDown" ? 1 : -1
      list[(at + step + list.length) % list.length]?.focus()
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault()
      list[e.key === "Home" ? 0 : list.length - 1]?.focus()
    }
  }

  if (props.items.length === 0) return null

  return (
    <div className={props.className || "u2-menu"} ref={wrap} onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        className={props.triggerClassName}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={props.triggerLabel}
        onClick={() => setOpen(!open)}
      >
        {props.trigger}
      </button>
      {open && (
        <ul className={props.listClassName || "u2-menu__list u2-panel"} role="menu">
          {props.items.map((item) => (
            <li key={item.key} role="none">
              {item.href ? (
                <a role="menuitem" tabIndex={-1} href={item.href} data-key={item.key}>
                  {item.label}
                </a>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  data-key={item.key}
                  onClick={() => {
                    setOpen(false)
                    item.onSelect?.()
                  }}
                >
                  {item.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
