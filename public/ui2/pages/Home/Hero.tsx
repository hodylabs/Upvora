import React, { useLayoutEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"

interface HeroProps {
  heading: React.ReactNode
  // The welcome message, already rendered and sanitized.
  html: string
  // Staff in Team view: where the message is set.
  editHref?: string
  children: React.ReactNode
}

// True when sanitized HTML shows something: text or an image.
export const hasText = (html: string): boolean => {
  // A template's content is inert: nothing in it loads or runs.
  const t = document.createElement("template")
  t.innerHTML = html
  return (t.content.textContent || "").trim() !== "" || !!t.content.querySelector("img")
}

// The site's own question and message, then the one box (children).
export const Hero = (props: HeroProps) => {
  const textRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const showText = hasText(props.html)

  // Read more only when the two-line clamp actually hides something at this width.
  useLayoutEffect(() => {
    const el = textRef.current
    if (!showText || open || !el) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    window.addEventListener("resize", measure)
    // Images in the message change its height once they load; load does not bubble, so capture it.
    el.addEventListener("load", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      el.removeEventListener("load", measure, true)
    }
  }, [showText, open, props.html])

  return (
    <section className="u2-hero">
      <h1 className="u2-hero__h">{props.heading}</h1>
      {showText && (
        // Sanitized by markdown.full, the same path classic's <Markdown> uses.
        <div ref={textRef} id="u2-hero-text" className={`u2-hero__text${open ? " is-open" : ""}`} dangerouslySetInnerHTML={{ __html: props.html }} />
      )}
      {showText && (clamped || open) && (
        <button type="button" className="u2-hero__more" aria-expanded={open} aria-controls="u2-hero-text" onClick={() => setOpen(!open)}>
          {open ? <Trans id="ui2.welcome.less">Show less</Trans> : <Trans id="ui2.welcome.more">Read more</Trans>}
        </button>
      )}
      {props.editHref && (
        <a className="u2-hero__edit" href={props.editHref}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />
          </svg>
          <Trans id="ui2.hero.edit">Edit this message</Trans>
        </a>
      )}
      {props.children}
    </section>
  )
}
