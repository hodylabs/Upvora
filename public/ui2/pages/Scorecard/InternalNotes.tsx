import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { InternalNote } from "@fider/models"
import { actions } from "@fider/services"

const SAVE_DELAY = 1200

// The shared team note for an idea, ported from classic's InternalNotesPanel. The idea
// page and the linked scorecard edit the same row server-side, so they never drift.
// Staff only: the parent gates rendering and the API enforces it too.
// shortcut: debounced autosave, last write wins; no merge for two people typing at once.
export const InternalNotes = (props: { postNumber: number; initialNote?: InternalNote }) => {
  const [note, setNote] = useState<InternalNote | undefined>(props.initialNote)
  const [content, setContent] = useState(props.initialNote?.content ?? "")
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved">("idle")
  const timer = useRef<number>()
  const latest = useRef(content)
  const editor = note?.updatedByName

  useEffect(() => {
    if (props.initialNote !== undefined && props.initialNote !== null) return
    actions.getInternalNote(props.postNumber).then((res) => {
      if (res.ok && res.data) {
        setNote(res.data)
        setContent(res.data.content)
        latest.current = res.data.content
      }
    })
  }, [props.postNumber])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const save = async (value: string) => {
    setState("saving")
    const res = await actions.setInternalNote(props.postNumber, value)
    if (res.ok) {
      setNote(res.data)
      // Only "saved" when nothing changed while the request was in flight.
      setState(latest.current === value ? "saved" : "dirty")
    } else {
      setState("dirty")
    }
  }

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setContent(value)
    latest.current = value
    setState("dirty")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => save(value), SAVE_DELAY)
  }

  const onBlur = () => {
    if (state !== "dirty") return
    window.clearTimeout(timer.current)
    save(latest.current)
  }

  return (
    <section className="u2-notes u2-panel">
      <div className="u2-notes__head">
        <label htmlFor="u2-notes" className="u2-notes__title">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M6 9V7a4 4 0 018 0v2M5 9h10v8H5z" />
          </svg>
          <Trans id="ui2.notes.title">Internal notes</Trans>
        </label>
        <span className="u2-notes__state u2-muted" role="status">
          {state === "saving" && <Trans id="ui2.notes.saving">Saving…</Trans>}
          {state === "saved" && <Trans id="ui2.notes.saved">Saved</Trans>}
          {state === "dirty" && <Trans id="ui2.notes.dirty">Unsaved changes</Trans>}
          {state === "idle" && editor && <Trans id="ui2.notes.lastedit">Last edited by {editor}</Trans>}
        </span>
      </div>
      <textarea
        id="u2-notes"
        className="u2-ctl u2-notes__text"
        value={content}
        onChange={onChange}
        onBlur={onBlur}
        maxLength={10000}
        placeholder={i18n._({
          id: "ui2.notes.placeholder",
          message: "Notes only your team can see: context, blockers, decisions. Also shown on the linked scorecard.",
        })}
      />
      <p className="u2-notes__hint u2-muted">
        <Trans id="ui2.notes.hint">Only collaborators and administrators can see this. Synced with the scorecard.</Trans>
      </p>
    </section>
  )
}
