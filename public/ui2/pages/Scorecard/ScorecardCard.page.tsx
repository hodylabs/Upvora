import "./scorecard.css"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { InternalNote, Post, ScorecardField, User } from "@fider/models"
import { actions, formatDate, navigator, notify } from "@fider/services"
import { useFider } from "@fider/hooks"
import { postHref } from "../../lib/nav"
import { bandForScore, computeWeightedScore, isAnswered, parseChoices } from "./score"
import { ScoreRing } from "./ScoreRing"
import { InternalNotes } from "./InternalNotes"
import { BriefButton } from "./BriefButton"

// Same props the server sends classic (app/handlers/scorecard_card.go).
export interface ScorecardCardPageProps {
  scorecard: {
    id: number
    postId?: number
    title: string
    values: Record<string, unknown>
    createdAt: string
    updatedAt: string
    post?: Post & { user?: User }
  }
  assigneeNames?: string[]
  internalNote?: InternalNote
}

const GROUP_ORDER = ["intake", "context", "workflow", "ownership", "classification", "scoring", "decision"] as const

const groupLabel = (g: string): string =>
  ({
    intake: i18n._({ id: "ui2.scorecard.group.intake", message: "Intake" }),
    context: i18n._({ id: "ui2.scorecard.group.context", message: "Context" }),
    workflow: i18n._({ id: "ui2.scorecard.group.workflow", message: "Workflow" }),
    ownership: i18n._({ id: "ui2.scorecard.group.ownership", message: "Ownership" }),
    classification: i18n._({ id: "ui2.scorecard.group.classification", message: "Classification" }),
    scoring: i18n._({ id: "ui2.scorecard.group.scoring", message: "Scoring" }),
    decision: i18n._({ id: "ui2.scorecard.group.decision", message: "Decision" }),
  })[g] || g

const groupHint = (g: string): string =>
  ({
    intake: i18n._({ id: "ui2.scorecard.hint.intake", message: "Additional intake questions" }),
    context: i18n._({ id: "ui2.scorecard.hint.context", message: "Filled in during review" }),
    workflow: i18n._({ id: "ui2.scorecard.hint.workflow", message: "Current state and the proposed AI-assisted future state" }),
    ownership: i18n._({ id: "ui2.scorecard.hint.ownership", message: "Who owns this if it moves forward" }),
    classification: i18n._({ id: "ui2.scorecard.hint.classification", message: "What kind of effort this is" }),
    scoring: i18n._({ id: "ui2.scorecard.hint.scoring", message: "1–5 each, 0 = not scored, weights sum to 100" }),
    decision: i18n._({ id: "ui2.scorecard.hint.decision", message: "Committee recommendation and outcome" }),
  })[g] || ""

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error"

export const SAVE_DEBOUNCE_MS = 1000
export const SAVE_RETRY_MS = 4000

const STEPS = [0, 1, 2, 3, 4, 5]

const ScorecardCardPage = (props: ScorecardCardPageProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const locale = fider.currentLocale
  const card = props.scorecard
  const allFields = tenant.scorecardFields ?? []
  const [title, setTitle] = useState(card.title)
  const [values, setValues] = useState<Record<string, unknown>>(card.values ?? {})
  const [saveState, setSaveState] = useState<SaveState>("idle")

  // Autosave, as classic: state drives the render; refs hold the latest payload and
  // in-flight bookkeeping so the debounced save never sends stale data. Edits made
  // during a save queue one more save; a failed save retries.
  const latest = useRef({ title: card.title, values: card.values ?? {} })
  const timer = useRef<number | undefined>(undefined)
  const inflight = useRef(false)
  const queued = useRef(false)
  const saveStateRef = useRef<SaveState>("idle")
  saveStateRef.current = saveState

  const doSave = async () => {
    if (inflight.current) {
      queued.current = true
      return
    }
    inflight.current = true
    setSaveState("saving")
    const res = await actions.updateScorecard(card.id, { title: latest.current.title, values: latest.current.values }).catch(() => ({ ok: false }))
    inflight.current = false
    if (res.ok) {
      if (queued.current) {
        queued.current = false
        void doSave()
      } else {
        setSaveState("saved")
      }
    } else {
      setSaveState("error")
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void doSave(), SAVE_RETRY_MS)
    }
  }

  const scheduleSave = () => {
    setSaveState("dirty")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void doSave(), SAVE_DEBOUNCE_MS)
  }

  // Registered once (reads the state through a ref): warns before leaving with
  // unsaved edits; the pending timer is cleared only on a real unmount.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = saveStateRef.current
      if (s === "dirty" || s === "saving" || s === "error") {
        e.preventDefault()
        e.returnValue = ""
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload)
      window.clearTimeout(timer.current)
    }
  }, [])

  const setValue = (key: string, v: unknown) => {
    latest.current = { ...latest.current, values: { ...latest.current.values, [key]: v } }
    setValues((prev) => ({ ...prev, [key]: v }))
    scheduleSave()
  }

  const changeTitle = (t: string) => {
    latest.current = { ...latest.current, title: t }
    setTitle(t)
    scheduleSave()
  }

  // Active fields always show; retired ones only where this card already answered them.
  const fields = allFields.filter((f) => f.isActive || isAnswered((card.values ?? {})[f.key]))
  const scoringFields = useMemo(() => allFields.filter((f) => f.isActive), [allFields])
  const score = useMemo(() => computeWeightedScore(values, scoringFields), [values, scoringFields])
  const band = bandForScore(score, tenant)

  const grouped: Record<string, ScorecardField[]> = {}
  for (const f of fields) {
    ;(grouped[f.groupKey] ??= []).push(f)
  }
  const headerFields = (grouped["header"] ?? []).filter((f) => f.type === "choice")
  const post = card.post
  const isStaff = fider.session.isAuthenticated && fider.session.user.isCollaborator

  const saveText: Record<SaveState, React.ReactNode> = {
    idle: null,
    dirty: <Trans id="ui2.scorecard.save.dirty">Unsaved changes…</Trans>,
    saving: <Trans id="ui2.scorecard.save.saving">Saving…</Trans>,
    saved: <Trans id="ui2.scorecard.save.saved">All changes saved</Trans>,
    error: <Trans id="ui2.scorecard.save.error">Not saved, retrying…</Trans>,
  }

  const retiredTag = (
    <span className="u2-chip u2-sc__retired">
      <Trans id="ui2.scorecard.retired">retired</Trans>
    </span>
  )

  // A choice select; a stored value no longer in the list stays selectable, marked retired.
  // TODO(form-primitives): shared select
  const choiceSelect = (f: ScorecardField, id: string, disabled: boolean) => {
    const strVal = String(values[f.key] ?? "")
    const choices = parseChoices(f.choices)
    const legacy = strVal !== "" && !choices.some((c) => c.value === strVal)
    return (
      <select id={id} className="u2-sc__control" value={strVal} disabled={disabled} onChange={(e) => setValue(f.key, e.target.value)}>
        <option value="">–</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.value}
          </option>
        ))}
        {legacy && <option value={strVal}>{i18n._({ id: "ui2.scorecard.retiredvalue", message: "{value} (retired)", values: { value: strVal } })}</option>}
      </select>
    )
  }

  const renderField = (f: ScorecardField) => {
    const key = f.key
    const val = values[key]
    const strVal = val == null ? "" : String(val)
    const retired = !f.isActive
    const id = `sc-${key}`
    const label = (
      <label htmlFor={id}>
        {f.label}
        {retired && retiredTag}
      </label>
    )

    if (f.type === "score") {
      const n = typeof val === "number" ? val : parseInt(strVal, 10) || 0
      return (
        <div key={key} className="u2-sc__score" data-field={key}>
          <div className="u2-sc__score-head">
            <label htmlFor={id} className="u2-sc__score-label">
              {f.label}
              {retired && retiredTag}
            </label>
            <span className="u2-mono u2-muted">×{f.weight ?? 0}</span>
            {f.question && <p className="u2-sc__score-q u2-muted">{f.question}</p>}
          </div>
          <div className="u2-sc__slider">
            {/* TODO(form-primitives): shared range input */}
            <input id={id} type="range" min={0} max={5} step={1} value={n} disabled={retired} onChange={(e) => setValue(key, parseInt(e.target.value, 10))} />
            <div className="u2-sc__steps u2-mono" aria-hidden="true">
              {STEPS.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
          </div>
          <span className={`u2-sc__score-val u2-mono${n === 0 ? " is-unset" : ""}`}>{n === 0 ? "–" : n}</span>
        </div>
      )
    }

    // TODO(form-primitives): shared inputs and textareas below
    if (f.type === "choice") {
      return (
        <div key={key} className="u2-sc__field">
          {label}
          {choiceSelect(f, id, retired)}
        </div>
      )
    }
    if (f.type === "note" || f.type === "multiline") {
      // note: a full-width textarea; multiline: half width, starts one line tall.
      return (
        <div key={key} className={`u2-sc__field${f.type === "note" ? " is-wide" : ""}`}>
          {label}
          <textarea
            id={id}
            className="u2-sc__control"
            rows={f.type === "note" ? 3 : 1}
            value={strVal}
            disabled={retired}
            onChange={(e) => setValue(key, e.target.value)}
          />
        </div>
      )
    }
    if (f.type === "user") {
      const listId = `scorecard-users-${key}`
      return (
        <div key={key} className="u2-sc__field">
          {label}
          <input
            id={id}
            className="u2-sc__control"
            type="text"
            list={listId}
            value={strVal}
            disabled={retired}
            onChange={(e) => setValue(key, e.target.value)}
            placeholder={i18n._({ id: "ui2.scorecard.userplaceholder", message: "Pick a collaborator or admin, or type any name" })}
          />
          <datalist id={listId}>
            {(props.assigneeNames ?? []).map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </div>
      )
    }
    // text, number, url, date
    const type = f.type === "number" ? "number" : f.type === "url" ? "url" : f.type === "date" ? "date" : "text"
    return (
      <div key={key} className="u2-sc__field">
        {label}
        <input id={id} className="u2-sc__control" type={type} value={strVal} disabled={retired} onChange={(e) => setValue(key, e.target.value)} />
      </div>
    )
  }

  const remove = async () => {
    const ok = window.confirm(i18n._({ id: "ui2.scorecard.delete.confirm", message: 'Delete scorecard "{title}"? This cannot be undone.', values: { title } }))
    if (!ok) return
    const r = await actions.deleteScorecard(card.id)
    if (r.ok) {
      navigator.goTo("/scorecard")
    } else {
      notify.error(i18n._({ id: "ui2.scorecard.delete.failed", message: "Delete failed." }))
    }
  }

  const date = (iso?: string) => (iso ? formatDate(locale, iso, "date") : "–")
  const addedOn = date(card.createdAt)
  const author = post?.user?.name ?? "–"
  const submittedOn = date(post?.createdAt)
  const votes = post?.votesCount ?? 0
  const comments = post?.commentsCount ?? 0

  return (
    <div className="u2-sc u2-sc--card">
      <div className="u2-sc__top">
        <a href="/scorecard" className="u2-sc__crumb">
          <Trans id="ui2.scorecard.back">All scorecards</Trans>
        </a>
        <span className={`u2-sc__save${saveState === "error" ? " u2-danger" : " u2-muted"}`} role="status" data-state={saveState}>
          {saveText[saveState]}
        </span>
        {post && (
          <a className="u2-btn u2-btn--primary" href={postHref(post)} target="_blank" rel="noopener">
            <Trans id="ui2.scorecard.openidea">Open idea</Trans>
            <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>

      <section className="u2-panel u2-sc__headcard">
        <div className="u2-sc__titlerow">
          {/* TODO(form-primitives): shared input */}
          <input
            className="u2-sc__titleinput"
            value={title}
            onChange={(e) => changeTitle(e.target.value)}
            aria-label={i18n._({ id: "ui2.scorecard.titlelabel", message: "Scorecard title" })}
          />
          {headerFields.map((f) => (
            <label key={f.key} className="u2-sc__status">
              <span className="u2-muted">{f.label}</span>
              {/* Classic keeps the header status editable even when retired. */}
              {choiceSelect(f, `sc-${f.key}`, false)}
            </label>
          ))}
        </div>

        <ScoreRing score={score} band={band} tenant={tenant} />

        {post ? (
          // Rendered live from the linked idea; edits there show here on the next load.
          <div className="u2-sc__idea">
            <div className="u2-sc__idea-title">
              <span className="u2-muted">
                <Trans id="ui2.table.idea">Idea</Trans>
              </span>
              <strong>{post.title}</strong>
            </div>
            {post.description && <p className="u2-sc__idea-desc">{post.description}</p>}
            <div className="u2-sc__meta">
              <span>
                <Trans id="ui2.scorecard.submitted">
                  Submitted by <strong>{author}</strong> on {submittedOn}
                </Trans>
              </span>
              <BriefButton postNumber={post.number} />
              <span>
                <Trans id="ui2.scorecard.added">To scorecard {addedOn}</Trans>
              </span>
              <span className="u2-mono">
                <Trans id="ui2.scorecard.counts">
                  <strong>{votes}</strong> votes, <strong>{comments}</strong> comments
                </Trans>
              </span>
              {Array.isArray(post.tags) && post.tags.length > 0 && (
                <span className="u2-sc__tags">
                  {post.tags.map((t) => (
                    <span key={String(t)} className="u2-chip u2-chip--tag">
                      {String(t)}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="u2-sc__meta u2-muted">
            <Trans id="ui2.scorecard.standalone">Standalone scorecard (not linked to an idea), created {addedOn}</Trans>
          </p>
        )}
      </section>

      {post && isStaff && <InternalNotes postNumber={post.number} initialNote={props.internalNote} />}

      {GROUP_ORDER.map((g) => {
        const rows = grouped[g]
        if (!rows || rows.length === 0) return null
        const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder)
        return (
          <section key={g} className="u2-panel u2-sc__group" data-group={g}>
            <header className="u2-sc__group-head">
              <h2>{groupLabel(g)}</h2>
              <span className="u2-muted">{groupHint(g)}</span>
            </header>
            <div className={g === "scoring" ? "u2-sc__scores" : "u2-sc__grid"}>{sorted.map(renderField)}</div>
          </section>
        )
      })}

      {isStaff && (
        <div className="u2-sc__danger">
          <button type="button" className="u2-btn u2-sc__delete" onClick={remove}>
            <Trans id="ui2.scorecard.delete">Delete scorecard</Trans>
          </button>
        </div>
      )}
    </div>
  )
}

export default ScorecardCardPage
