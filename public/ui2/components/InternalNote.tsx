import "./internalnote.css"

import React, { useEffect, useId, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { InternalNote as Note } from "@fider/models"
import { actions } from "@fider/services"

export const NOTE_SAVE_DELAY = 1200

// The team-only note on an idea, on the idea page and the linked scorecard: both edit
// the same row server-side, so they never drift. Staff only; the caller gates
// rendering and the API checks it again.
// One save is in flight at a time, and a save that finishes behind newer typing sends
// the newer text, so the last draft is the one stored.
// shortcut: last write wins between two people editing one note; add conflict handling if that happens.
export const InternalNote = (props: { postNumber: number; initial?: Note | null; className?: string }) => {
  const id = useId()
  const [note, setNote] = useState<Note | undefined>(props.initial ?? undefined)
  const [content, setContent] = useState(props.initial?.content ?? "")
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle")
  const timer = useRef<number>()
  const latest = useRef(content)
  const stored = useRef(content)
  const edited = useRef(false)
  const inFlight = useRef(false)
  const again = useRef(false)

  useEffect(() => {
    if (props.initial) return
    let live = true
    actions.getInternalNote(props.postNumber).then((r) => {
      if (!live || !r.ok || !r.data) return
      setNote(r.data)
      // Typing started before the note arrived: keep the draft, it saves over the old text.
      if (edited.current) return
      setContent(r.data.content)
      latest.current = r.data.content
      stored.current = r.data.content
    })
    return () => {
      live = false
    }
  }, [props.postNumber])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const flush = async () => {
    if (inFlight.current) {
      again.current = true
      return
    }
    inFlight.current = true
    setState("saving")
    let failed = false
    do {
      again.current = false
      const value = latest.current
      // A rejected request (network, bad JSON) counts as a failed save, so the latch is released.
      const r = await actions.setInternalNote(props.postNumber, value).catch(() => undefined)
      if (!r?.ok) {
        failed = true
        // Newer text typed during the failed save gets its own try; otherwise the next edit or blur retries.
        if (again.current && latest.current !== value) continue
        break
      }
      failed = false
      stored.current = value
      setNote(r.data)
    } while (again.current)
    inFlight.current = false
    setState(!failed && latest.current === stored.current ? "saved" : "dirty")
  }

  const change = (value: string) => {
    edited.current = true
    setContent(value)
    latest.current = value
    setState("dirty")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      flush()
    }, NOTE_SAVE_DELAY)
  }

  const blur = () => {
    if (latest.current === stored.current) return
    window.clearTimeout(timer.current)
    timer.current = undefined
    flush()
  }

  const by = note?.updatedByName || ""
  return (
    <section className={["u2-note-int", props.className].filter(Boolean).join(" ")} aria-labelledby={`${id}-h`}>
      <div className="u2-note-int__head">
        <h2 id={`${id}-h`}>
          <Trans id="ui2.idea.note.title">Internal note</Trans>
        </h2>
        <span className="u2-muted" aria-live="polite">
          {state === "saving" && <Trans id="ui2.idea.note.saving">Saving…</Trans>}
          {state === "saved" && <Trans id="ui2.idea.note.saved">Saved</Trans>}
          {state === "dirty" && <Trans id="ui2.idea.note.dirty">Unsaved changes</Trans>}
          {state === "idle" && by && <Trans id="ui2.idea.note.by">Last edited by {by}</Trans>}
        </span>
      </div>
      <textarea
        className="u2-ctl"
        aria-labelledby={`${id}-h`}
        aria-describedby={`${id}-hint`}
        value={content}
        maxLength={10000}
        placeholder={i18n._({ id: "ui2.idea.note.placeholder", message: "Context, blockers, decisions. Only your team sees this." })}
        onChange={(e) => change(e.target.value)}
        onBlur={blur}
      />
      <p id={`${id}-hint`} className="u2-muted">
        <Trans id="ui2.note.hint">Only collaborators and administrators can see this. The idea page and its scorecard share this note.</Trans>
      </p>
    </section>
  )
}
