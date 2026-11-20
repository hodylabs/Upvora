import "./idea.css"

import React, { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { useFider } from "@fider/hooks"
import { isTypingTarget } from "../../components/useRowKeys"
import { IdeaData, IdeaView, loadIdea } from "./IdeaView"

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

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    ref.current?.focus()
    document.body.style.overflow = "hidden"
    // The board behind (the app root; the overlay is portaled outside it) leaves the tab order.
    const app = document.getElementById("root")
    app?.setAttribute("inert", "")
    // Dialogs inside handle their own Esc first (capture phase) and stop it there.
    const onKey = (e: KeyboardEvent) => {
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
      <div ref={ref} className="u2-ovl__panel" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="u2-ovl__bar">
          <button type="button" className="u2-btn u2-btn--ghost u2-btn--small" onClick={() => props.onClose()}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            <Trans id="ui2.idea.back">Back to the board</Trans>
          </button>
        </div>
        {data === undefined ? (
          <p className="u2-muted" aria-busy="true" id={titleId}>
            <Trans id="ui2.peek.loading">Loading…</Trans>
          </p>
        ) : data === null ? (
          <p className="u2-muted" role="alert" id={titleId}>
            {i18n._({ id: "ui2.idea.loadfailed", message: "This idea could not be loaded." })}{" "}
            <a href={location.pathname}>
              <Trans id="ui2.idea.openpage">Open its page</Trans>
            </a>
          </p>
        ) : (
          <IdeaView key={props.number} data={data} titleId={titleId} onDataChanged={props.onDataChanged} />
        )}
      </div>
    </div>,
    document.body
  )
}

export default IdeaOverlay
