import React, { useEffect, useId, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { InternalNote as Note } from "@fider/models"
import { actions } from "@fider/services"

const SAVE_DELAY = 1200

// The team-only note on an idea: the same row the linked scorecard edits, so the two
// never drift. Staff only; the caller gates rendering and the API checks it again.
export const InternalNote = (props: { postNumber: number; initial?: Note }) => {
  const id = useId()
  const [note, setNote] = useState<Note | undefined>(props.initial)
  const [content, setContent] = useState(props.initial?.content ?? "")
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle")
  const timer = useRef<number>()
  const latest = useRef(content)

  useEffect(() => {
    if (props.initial !== undefined) return
    actions.getInternalNote(props.postNumber).then((r) => {
      if (!r.ok) return
      setNote(r.data)
      setContent(r.data.content)
      latest.current = r.data.content
    })
  }, [props.postNumber])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const save = async (value: string) => {
    setState("saving")
    const r = await actions.setInternalNote(props.postNumber, value)
    if (r.ok) {
      setNote(r.data)
      setState(latest.current === value ? "saved" : "dirty")
    } else {
      setState("dirty")
    }
  }

  const change = (value: string) => {
    setContent(value)
    latest.current = value
    setState("dirty")
    window.clearTimeout(timer.current)
    // shortcut: debounced autosave, last write wins; add conflict handling if two people edit one note at once.
    timer.current = window.setTimeout(() => save(value), SAVE_DELAY)
  }

  const blur = () => {
    if (state !== "dirty") return
    window.clearTimeout(timer.current)
    save(latest.current)
  }

  const by = note?.updatedByName || ""
  return (
    <section className="u2-note-int" aria-labelledby={`${id}-h`}>
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
        <Trans id="ui2.idea.note.hint">Only collaborators and administrators can see this. Shared with the scorecard.</Trans>
      </p>
    </section>
  )
}
