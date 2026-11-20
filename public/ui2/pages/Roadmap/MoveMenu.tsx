import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"

export interface MoveTarget {
  slug: string
  label: string
}

// The keyboard way to move an idea between lanes (staff): a "Move to…" button on the
// tile opens a menu of the other lanes. Arrow keys move through it, Enter picks,
// Esc closes and puts focus back on the button.
// TODO(form-primitives): swap for the shared menu/popover once it lands.
export const MoveMenu = (props: { title: string; targets: MoveTarget[]; onMove: (slug: string) => void }) => {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  const items = () => Array.from(wrap.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") || [])

  useEffect(() => {
    if (!open) return
    items()[0]?.focus()
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
    if (!open) return
    const list = items()
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === "Escape") {
      e.stopPropagation()
      close()
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const step = e.key === "ArrowDown" ? 1 : -1
      list[(at + step + list.length) % list.length]?.focus()
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault()
      list[e.key === "Home" ? 0 : list.length - 1]?.focus()
    }
  }

  if (props.targets.length === 0) return null

  return (
    <div className="u2-move" ref={wrap} onKeyDown={onKey}>
      <button
        ref={trigger}
        type="button"
        className="u2-move__btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={i18n._({ id: "ui2.roadmap.moveto.label", message: "Move {title} to another lane", values: { title: props.title } })}
        onClick={() => setOpen(!open)}
      >
        <Trans id="ui2.roadmap.moveto">Move to…</Trans>
      </button>
      {open && (
        <ul className="u2-move__list u2-panel" role="menu">
          {props.targets.map((t) => (
            <li key={t.slug} role="none">
              <button
                type="button"
                role="menuitem"
                data-slug={t.slug}
                onClick={() => {
                  setOpen(false)
                  props.onMove(t.slug)
                }}
              >
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
