import "./idea.css"

import React, { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { useFider } from "@fider/hooks"
import { isTypingTarget } from "../../components/useRowKeys"
import { CloseButton, IdeaData, IdeaView, loadIdea } from "./IdeaView"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

interface IdeaOverlayProps {
  number: number
  // The board's usePostOverlay close: pushes the board URL back (Esc or the close button).
  onClose: () => void
  onDataChanged?: () => void
}

// The idea over the board, like classic's post overlay: the URL is already the idea's
// (usePostOverlay pushed it), Esc or the close button returns to the board, and the
// browser's Back does the same through popstate. It renders the same IdeaView as the page.
const IdeaOverlay = (props: IdeaOverlayProps) => {
  const fider = useFider()
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const [data, setData] = useState<IdeaData | null | undefined>(undefined)
  const onClose = useRef(props.onClose)
  onClose.current = props.onClose

  useEffect(() => {
    let live = true
    setData(undefined)
    loadIdea(props.number, fider.session.isAuthenticated)
      .then((d) => live && setData(d))
      .catch(() => live && setData(null))
    return () => {
      live = false
    }
  }, [props.number])

  // The loading state's close button unmounts when the idea arrives: keep focus in the sheet.
  useEffect(() => {
    if (data && !ref.current?.contains(document.activeElement)) ref.current?.focus()
  }, [data])

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.focus()
    document.body.style.overflow = "hidden"
    // The board behind (the app root; the overlay is portaled outside it) leaves the tab order.
    const app = document.getElementById("root")
    app?.setAttribute("inert", "")
    // Dialogs inside handle their own Esc first (capture phase) and stop it there.
    const onKey = (e: KeyboardEvent) => {
      // Tab wraps inside the sheet (an open dialog runs its own trap from #root-modal).
      const sheet = ref.current
      if (e.key === "Tab" && sheet && (sheet.contains(document.activeElement) || document.activeElement === document.body)) {
        const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement)
        const first = items[0]
        const last = items[items.length - 1]
        if (first && e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
          e.preventDefault()
          last.focus()
        } else if (last && !e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
        return
      }
      if (e.key !== "Escape" || e.defaultPrevented || isTypingTarget(e.target)) return
      onClose.current()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      app?.removeAttribute("inert")
      document.body.style.overflow = ""
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

  return createPortal(
    <div className="u2-ovl">
      <div ref={ref} className="u2-ovl__panel u2-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        {data ? (
          <IdeaView key={props.number} data={data} titleId={titleId} onDataChanged={props.onDataChanged} onClose={() => props.onClose()} />
        ) : (
          <>
            <div className="u2-idea__top">
              <span className="u2-mono">#{props.number}</span>
              <span className="u2-idea__sp" />
              <CloseButton onClose={() => props.onClose()} />
            </div>
            <div className="u2-idea__body">
              {data === undefined ? (
                <p className="u2-muted" aria-busy="true" id={titleId}>
                  <Trans id="ui2.peek.loading">Loading…</Trans>
                </p>
              ) : (
                <p className="u2-muted" role="alert" id={titleId}>
                  {i18n._({ id: "ui2.idea.loadfailed", message: "This idea could not be loaded." })}{" "}
                  <a href={location.pathname}>
                    <Trans id="ui2.idea.openpage">Open its page</Trans>
                  </a>
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

export default IdeaOverlay
