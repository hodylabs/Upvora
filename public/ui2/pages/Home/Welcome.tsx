import React, { useLayoutEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"

export type MessageSize = "none" | "short" | "long"

// About two lines of the headline style.
const SHORT_CHARS = 140

// How the welcome message reads, from its rendered (sanitized) HTML: nothing, a one or
// two line headline, or a longer text that clamps with Read more.
export const messageSize = (html: string): MessageSize => {
  // A template's content is inert: nothing in it loads or runs.
  const t = document.createElement("template")
  t.innerHTML = html
  const text = (t.content.textContent || "").trim()
  if (!text) return "none"
  const blocks = t.content.querySelectorAll("h1, h2, h3, h4, h5, h6, ul, ol, pre, blockquote, table, hr")
  return text.length <= SHORT_CHARS && blocks.length === 0 && t.content.querySelectorAll("p").length <= 2 ? "short" : "long"
}

interface WelcomeProps {
  heading?: React.ReactNode
  // The welcome message, already rendered and sanitized.
  html: string
  // Staff get Edit (or Add a message) linking to where the message is set.
  editHref?: string
  // The share side: given the "Add a message" link to place by its Share button.
  share: (extra: React.ReactNode) => React.ReactNode
}

// The welcome card: the site's message on the left, the share box on the right,
// one card split by a hairline. With no message it becomes one bar.
export const Welcome = (props: WelcomeProps) => {
  const textRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const size = messageSize(props.html)
  const mode: MessageSize = size === "none" && props.heading ? "short" : size

  // Read more only when the clamp actually hides something at this width.
  useLayoutEffect(() => {
    const el = textRef.current
    if (mode !== "long" || open || !el) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [mode, open, props.html])

  const add = props.editHref && mode === "none" && (
    <a className="u2-welcome__add" href={props.editHref}>
      <Trans id="ui2.welcome.add">Add a message</Trans>
    </a>
  )

  return (
    <section className={`u2-welcome is-${mode}${open ? " is-open" : ""}`} aria-label={i18n._({ id: "ui2.welcome.label", message: "Welcome" })}>
      {mode !== "none" && (
        <div className="u2-welcome__msg">
          {props.editHref && (
            <a className="u2-welcome__edit" href={props.editHref} aria-label={i18n._({ id: "ui2.welcome.edit.label", message: "Edit welcome message" })}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
              </svg>
              <Trans id="ui2.welcome.edit">Edit</Trans>
            </a>
          )}
          {props.heading && <h1 className="u2-welcome__h">{props.heading}</h1>}
          {size !== "none" && (
            // Sanitized by markdown.full, the same path classic's <Markdown> uses.
            <div ref={textRef} id="u2-welcome-text" className="u2-welcome__text" dangerouslySetInnerHTML={{ __html: props.html }} />
          )}
          {mode === "long" && (clamped || open) && (
            <button type="button" className="u2-welcome__more" aria-expanded={open} aria-controls="u2-welcome-text" onClick={() => setOpen(!open)}>
              {open ? <Trans id="ui2.welcome.less">Show less</Trans> : <Trans id="ui2.welcome.more">Read more</Trans>}
            </button>
          )}
        </div>
      )}
      {props.share(add)}
    </section>
  )
}
