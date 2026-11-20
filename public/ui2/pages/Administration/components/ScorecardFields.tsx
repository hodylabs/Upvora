import "./adminc.css"

import React, { useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { ScorecardField, ScorecardFieldChoice } from "@fider/models"
import { actions, Failure, Fider } from "@fider/services"
import { Button, Field, Form, IconButton, Select, TextArea, TextInput, Toggle } from "../../../components/form"
import { ConfirmDialog } from "../../../components/feedback"
import { AdminSection } from "../AdminLayout"

// The scorecard field catalogue (classic's ScorecardFieldsSection): add, edit,
// reorder within a group, activate or deactivate, and delete fields nobody has
// answered yet. Answered fields can only be deactivated, so history stays intact.
// Collaborators and administrators can edit (the server checks the same).

const GROUPS: [string, string][] = [
  ["header", "Header (top of the card, next to the title)"],
  ["intake", "Intake"],
  ["context", "Context"],
  ["workflow", "Workflow"],
  ["ownership", "Ownership"],
  ["classification", "Classification"],
  ["scoring", "Scoring (weighted 1-5)"],
  ["decision", "Decision"],
]
const TYPES: [string, string][] = [
  ["text", "Text: single line"],
  ["multiline", "Multiline: text-sized box that grows, two fit per row"],
  ["note", "Note: multi-line, full row width"],
  ["date", "Date"],
  ["number", "Number"],
  ["url", "URL"],
  ["choice", "Choice: dropdown with pre-set options"],
  ["score", "Score: 1-5 slider that feeds the weighted score"],
  ["user", "User: pick a collaborator/admin or type any name"],
]
const groupOrder = GROUPS.map(([k]) => k)
const groupLabel = (key: string) => GROUPS.find(([k]) => k === key)?.[1] ?? key

// Choices are edited as "Value" or "Value:bucket" (bucket = new | review | executive,
// for the dashboard tabs), comma-separated. Colors, and buckets not restated, are kept
// by merging with the previous list by value, so editing never wipes them.
const VALID_BUCKETS = ["new", "review", "executive"]

export const choicesToCsv = (raw: unknown): string => {
  if (!raw || !Array.isArray(raw)) return ""
  return raw
    .map((c: unknown) => {
      if (typeof c === "string") return c
      const ch = c as ScorecardFieldChoice | undefined
      if (!ch?.value) return ""
      return ch.bucket ? `${ch.value}:${ch.bucket}` : ch.value
    })
    .filter(Boolean)
    .join(", ")
}

export const csvToChoices = (s: string, previous?: ScorecardFieldChoice[]): ScorecardFieldChoice[] => {
  const prevByValue = new Map((previous ?? []).map((c) => [c.value, c]))
  return s
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map((entry) => {
      const sep = entry.lastIndexOf(":")
      const maybeBucket =
        sep >= 0
          ? entry
              .slice(sep + 1)
              .trim()
              .toLowerCase()
          : ""
      const hasBucket = VALID_BUCKETS.includes(maybeBucket)
      const value = hasBucket ? entry.slice(0, sep).trim() : entry
      const prev = prevByValue.get(value)
      const choice: ScorecardFieldChoice = { value }
      if (prev?.color) choice.color = prev.color
      const bucket = hasBucket ? (maybeBucket as ScorecardFieldChoice["bucket"]) : prev?.bucket
      if (bucket) choice.bucket = bucket
      return choice
    })
}

export const slugifyKey = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60)

export const byGroupThenOrder = (a: ScorecardField, b: ScorecardField): number => {
  const ga = groupOrder.indexOf(a.groupKey)
  const gb = groupOrder.indexOf(b.groupKey)
  if (ga !== gb) return ga - gb
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return a.id - b.id
}

export const weightSum = (fields: ScorecardField[]) => fields.filter((f) => f.type === "score" && f.isActive).reduce((s, f) => s + (f.weight ?? 0), 0)

interface Draft {
  key: string
  label: string
  group: string
  type: string
  choicesCSV: string
  weight: string
  question: string
  sortOrder: number
  isActive: boolean
}

const emptyDraft: Draft = { key: "", label: "", group: "context", type: "text", choicesCSV: "", weight: "", question: "", sortOrder: 100, isActive: true }

// The fields to send when only one thing changes on an existing row.
const rowUpdate = (f: ScorecardField) => ({
  label: f.label,
  choices: f.type === "choice" ? f.choices : undefined,
  weight: f.weight,
  question: f.question,
  sortOrder: f.sortOrder,
  isActive: f.isActive,
})

const parseWeight = (d: Draft) => {
  if (d.type !== "score" || d.weight === "") return undefined
  const n = parseInt(d.weight, 10)
  return Number.isNaN(n) ? undefined : n
}

export const ScorecardFields = (props: { fields: ScorecardField[]; usage: { [key: string]: number } }) => {
  const canEdit = Fider.session.user.isCollaborator
  const [fields, setFields] = useState<ScorecardField[]>(props.fields ?? [])
  const [mode, setMode] = useState<"none" | "add" | number>("none")
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)
  const [toDelete, setToDelete] = useState<ScorecardField | undefined>()
  // Rows with a request in flight. The update endpoint replaces the whole row, so a
  // second action on the same row waits until the first one's result is in local state.
  const [pending, setPending] = useState<number[]>([])
  const pendingRef = useRef(new Set<number>())
  const rowAction = async (id: number, run: () => Promise<void>) => {
    if (pendingRef.current.has(id)) return
    pendingRef.current.add(id)
    setPending([...pendingRef.current])
    try {
      await run()
    } finally {
      pendingRef.current.delete(id)
      setPending([...pendingRef.current])
    }
  }
  const adding = mode === "add"
  const editing = typeof mode === "number" ? fields.find((f) => f.id === mode) : undefined
  const t = (id: string, message: string) => i18n._({ id, message })

  const openAdd = () => {
    setMode("add")
    setDraft(emptyDraft)
    setError(undefined)
  }
  const openEdit = (f: ScorecardField) => {
    setMode(f.id)
    setDraft({
      key: f.key,
      label: f.label,
      group: f.groupKey,
      type: f.type,
      choicesCSV: choicesToCsv(f.choices),
      weight: f.weight != null ? String(f.weight) : "",
      question: f.question ?? "",
      sortOrder: f.sortOrder,
      isActive: f.isActive,
    })
    setError(undefined)
  }
  const cancel = () => {
    setMode("none")
    setError(undefined)
  }

  // While adding, the key follows the label until the key is edited by hand. The
  // key of an existing field never changes.
  const setLabel = (label: string) =>
    setDraft((d) => ({ ...d, label, key: adding && (d.key === "" || d.key === slugifyKey(d.label)) ? slugifyKey(label) : d.key }))

  const save = async () => {
    let choices: ScorecardFieldChoice[] | undefined
    if (draft.type === "choice") {
      // Untouched choices go back exactly as stored (a value may hold a comma or a ":review" suffix).
      const unchanged = !!editing && draft.choicesCSV === choicesToCsv(editing.choices)
      choices = unchanged && editing?.choices ? editing.choices : csvToChoices(draft.choicesCSV, editing?.choices)
      if (choices.length === 0) {
        setError({ errors: [{ field: "choices", message: t("ui2.admin.scorecard.choicesneeded", "Enter at least one option (comma-separated).") }] })
        return
      }
    }
    const weight = parseWeight(draft)
    setBusy(true)
    if (adding) {
      const result = await actions.createScorecardField({
        key: draft.key,
        label: draft.label,
        groupKey: draft.group,
        type: draft.type as ScorecardField["type"],
        choices,
        weight,
        question: draft.type === "score" ? draft.question : undefined,
        sortOrder: draft.sortOrder,
      })
      setBusy(false)
      if (!result.ok) return setError(result.error)
      setMode("none")
      setFields((list) => [...list, result.data as ScorecardField].sort(byGroupThenOrder))
      return
    }
    if (!editing) {
      setBusy(false)
      setMode("none")
      return
    }
    // System rows keep their choices (a locked score row has none anyway).
    let result: Awaited<ReturnType<typeof actions.updateScorecardField>> | undefined
    await rowAction(editing.id, async () => {
      result = await actions.updateScorecardField(editing.id, {
        label: draft.label,
        choices: editing.type === "choice" ? choices : undefined,
        weight,
        question: draft.type === "score" ? draft.question : undefined,
        sortOrder: draft.sortOrder,
        isActive: draft.isActive,
      })
    })
    setBusy(false)
    if (!result) return
    if (!result.ok) return setError(result.error)
    setMode("none")
    setFields((list) =>
      list
        .map((f) =>
          f.id === editing.id
            ? {
                ...f,
                label: draft.label,
                choices: f.type === "choice" ? choices : f.choices,
                weight: draft.type === "score" ? (weight ?? f.weight) : f.weight,
                question: draft.type === "score" ? draft.question : f.question,
                sortOrder: draft.sortOrder,
                isActive: draft.isActive,
              }
            : f
        )
        .sort(byGroupThenOrder)
    )
  }

  const remove = async (f: ScorecardField) => {
    const result = await actions.deleteScorecardField(f.id)
    setToDelete(undefined)
    if (result.ok) setFields((list) => list.filter((x) => x.id !== f.id))
    else setError(result.error)
  }

  // The lifecycle action for answered fields, which cannot be deleted.
  const setActive = (f: ScorecardField, isActive: boolean) =>
    rowAction(f.id, async () => {
      const result = await actions.updateScorecardField(f.id, { ...rowUpdate(f), isActive })
      if (result.ok) setFields((list) => list.map((x) => (x.id === f.id ? { ...x, isActive } : x)))
      else setError(result.error)
    })

  const move = async (f: ScorecardField, direction: -1 | 1) => {
    const same = fields.filter((x) => x.groupKey === f.groupKey).sort(byGroupThenOrder)
    const idx = same.findIndex((x) => x.id === f.id)
    const neighbor = same[idx + direction]
    if (idx < 0 || !neighbor) return
    const sortOrder = direction === -1 ? neighbor.sortOrder - 1 : neighbor.sortOrder + 1
    await rowAction(f.id, async () => {
      const result = await actions.updateScorecardField(f.id, { ...rowUpdate(f), sortOrder })
      if (result.ok) setFields((list) => list.map((x) => (x.id === f.id ? { ...x, sortOrder } : x)).sort(byGroupThenOrder))
    })
  }

  const sum = weightSum(fields)
  const rows = [...fields].sort(byGroupThenOrder)
  const sortOrderInput = (
    <TextInput
      name="sortOrder"
      inputMode="numeric"
      label={<Trans id="ui2.admin.scorecard.sortorder">Sort order (lower shows first within its group)</Trans>}
      value={String(draft.sortOrder)}
      onChange={(v) => setDraft({ ...draft, sortOrder: parseInt(v || "0", 10) || 0 })}
    />
  )

  return (
    <>
      <p className={sum === 100 ? "u2-admin__note" : "u2-admin__note u2-admin__note--warn"} data-testid="u2-weights" data-sum={sum}>
        <b className="u2-mono">{sum}</b>{" "}
        <b>
          <Trans id="ui2.admin.scorecard.weights">Scoring weights</Trans>
        </b>
        {": "}
        {sum === 100 ? (
          <Trans id="ui2.admin.scorecard.weightsok">active weights sum to 100, the weighted score maps cleanly to 0–100.</Trans>
        ) : (
          <Trans id="ui2.admin.scorecard.weightsbad">
            active weights must sum to 100 for the weighted score to map to 0–100. Edit the weights of the scoring rows to rebalance.
          </Trans>
        )}
      </p>

      {mode !== "none" && (
        <AdminSection
          title={adding ? <Trans id="ui2.admin.scorecard.addfield">Add a field</Trans> : <Trans id="ui2.admin.scorecard.editfield">Edit field</Trans>}
          lede={adding ? <Trans id="ui2.admin.scorecard.addhint">New questions appear on new scorecards immediately</Trans> : `key: ${draft.key}`}
        >
          <Form error={error} onSubmit={save}>
            <TextInput name="label" label={<Trans id="ui2.admin.scorecard.label">Label</Trans>} value={draft.label} onChange={setLabel} />
            {adding ? (
              <TextInput
                name="key"
                label={<Trans id="ui2.admin.scorecard.key">Key (machine name: lowercase letters, digits, underscores)</Trans>}
                value={draft.key}
                onChange={(v) => setDraft({ ...draft, key: slugifyKey(v) })}
              />
            ) : (
              <TextInput name="key" label={<Trans id="ui2.admin.scorecard.keyro">Key</Trans>} value={draft.key} disabled onChange={() => undefined} />
            )}
            {adding ? (
              <>
                <Select
                  name="groupKey"
                  label={<Trans id="ui2.admin.scorecard.group">Group</Trans>}
                  value={draft.group}
                  options={GROUPS.map(([value, label]) => ({ value, label }))}
                  onChange={(v) => setDraft({ ...draft, group: v || "context" })}
                />
                <Select
                  name="type"
                  label={<Trans id="ui2.admin.scorecard.type">Type</Trans>}
                  value={draft.type}
                  options={TYPES.map(([value, label]) => ({ value, label }))}
                  onChange={(v) => setDraft({ ...draft, type: v || "text" })}
                />
              </>
            ) : (
              <>
                <TextInput
                  name="groupKey"
                  label={<Trans id="ui2.admin.scorecard.group">Group</Trans>}
                  value={groupLabel(draft.group)}
                  disabled
                  onChange={() => undefined}
                />
                <TextInput name="type" label={<Trans id="ui2.admin.scorecard.type">Type</Trans>} value={draft.type} disabled onChange={() => undefined} />
              </>
            )}
            {draft.type === "score" && (
              <>
                <TextInput
                  name="weight"
                  inputMode="numeric"
                  label={<Trans id="ui2.admin.scorecard.weight">Weight (0-100; active weights across all scoring rows must sum to 100)</Trans>}
                  value={draft.weight}
                  onChange={(v) => setDraft({ ...draft, weight: v.replace(/[^0-9]/g, "") })}
                />
                {sortOrderInput}
                <TextArea
                  name="question"
                  label={<Trans id="ui2.admin.scorecard.question">Question (shown next to the 1-5 slider on the card page)</Trans>}
                  value={draft.question}
                  onChange={(v) => setDraft({ ...draft, question: v })}
                />
              </>
            )}
            {draft.type === "choice" && (
              <TextInput
                name="choices"
                label={
                  <Trans id="ui2.admin.scorecard.choices">
                    Choices (comma-separated, in order; add :new / :review / :executive after a value to map it to a dashboard tab)
                  </Trans>
                }
                value={draft.choicesCSV}
                onChange={(v) => setDraft({ ...draft, choicesCSV: v })}
              />
            )}
            {draft.type !== "score" && sortOrderInput}
            {!adding && (
              <Field
                label={<Trans id="ui2.admin.scorecard.active">Active</Trans>}
                hint={
                  <Trans id="ui2.admin.scorecard.activehint">
                    Deactivating hides the field from new cards without deleting it; cards that answered it keep showing it.
                  </Trans>
                }
                group
              >
                <Toggle
                  checked={draft.isActive}
                  label={t("ui2.admin.scorecard.active", "Active")}
                  hideLabel
                  onChange={(v) => setDraft({ ...draft, isActive: v })}
                />
              </Field>
            )}
            <div className="u2-actions">
              <Button variant="ghost" onClick={cancel}>
                <Trans id="action.cancel">Cancel</Trans>
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!canEdit}>
                {adding ? <Trans id="ui2.admin.scorecard.add">Add field</Trans> : <Trans id="ui2.admin.scorecard.savechanges">Save changes</Trans>}
              </Button>
            </div>
          </Form>
        </AdminSection>
      )}

      <AdminSection
        title={<Trans id="ui2.admin.scorecard.catalogue">Field catalogue</Trans>}
        lede={<Trans id="ui2.admin.scorecard.cataloguehint">Answered questions can be deactivated, never deleted: history stays intact</Trans>}
        actions={
          mode === "none" && (
            <Button variant="primary" small onClick={openAdd} disabled={!canEdit}>
              <Trans id="ui2.admin.scorecard.addbtn">Add a field</Trans>
            </Button>
          )
        }
      >
        {mode === "none" && error && (
          <p className="u2-fld__error" role="alert">
            {(error.errors || []).map((e) => e.message).join(" ")}
          </p>
        )}
        <ul className="u2-alist">
          {rows.map((f) => {
            const answers = props.usage?.[f.key] ?? 0
            const usage =
              answers > 0
                ? f.isActive
                  ? i18n._({ id: "ui2.admin.scorecard.usage", message: "{answers, plural, one {# card} other {# cards}}", values: { answers } })
                  : i18n._({
                      id: "ui2.admin.scorecard.usageold",
                      message: "{answers, plural, one {on # old card} other {on # old cards}} · hidden on new",
                      values: { answers },
                    })
                : t("ui2.admin.scorecard.never", "never answered")
            // Locked while a request for this row runs or its edit form is open.
            const locked = !canEdit || pending.includes(f.id) || mode === f.id
            return (
              <li key={f.id} data-field={f.key} className={f.isActive ? undefined : "u2-sf--inactive"}>
                <div className="u2-row u2-sf__order">
                  <IconButton small variant="ghost" label={t("ui2.admin.scorecard.up", "Move up")} onClick={() => move(f, -1)} disabled={locked}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </IconButton>
                  <IconButton small variant="ghost" label={t("ui2.admin.scorecard.down", "Move down")} onClick={() => move(f, 1)} disabled={locked}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </IconButton>
                  <span className="u2-mono u2-muted">{f.sortOrder}</span>
                </div>
                <div className="u2-alist__main">
                  <div>
                    {f.label}{" "}
                    {!f.isActive && (
                      <span className="u2-chip">
                        <Trans id="ui2.admin.scorecard.inactive">inactive</Trans>
                      </span>
                    )}
                  </div>
                  <div className="u2-alist__meta">
                    <span className="u2-mono">{f.key}</span>
                    {f.isSystem ? " · system" : ""} · {f.type} · {groupLabel(f.groupKey)}
                    {f.type === "score" ? ` · ${f.weight ?? 0}%` : ""} · {usage}
                  </div>
                </div>
                <div className="u2-alist__acts">
                  <Button small variant="ghost" onClick={() => openEdit(f)} disabled={locked}>
                    <Trans id="action.edit">Edit</Trans>
                  </Button>
                  {answers > 0 ? (
                    <Button small onClick={() => setActive(f, !f.isActive)} disabled={locked}>
                      {f.isActive ? (
                        <Trans id="ui2.admin.scorecard.deactivate">Deactivate</Trans>
                      ) : (
                        <Trans id="ui2.admin.scorecard.reactivate">Reactivate</Trans>
                      )}
                    </Button>
                  ) : (
                    <Button small variant="danger" onClick={() => setToDelete(f)} disabled={locked} data-act="delete">
                      <Trans id="action.delete">Delete</Trans>
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </AdminSection>

      <ConfirmDialog
        open={!!toDelete}
        danger
        title={<Trans id="ui2.admin.scorecard.deletetitle">Delete field</Trans>}
        confirmLabel={<Trans id="action.delete">Delete</Trans>}
        onCancel={() => setToDelete(undefined)}
        onConfirm={() => (toDelete ? remove(toDelete) : undefined)}
      >
        <p>
          {toDelete?.isSystem
            ? i18n._({
                id: "ui2.admin.scorecard.deletesystem",
                message:
                  'Delete the seeded field "{label}"? It has never been answered on any scorecard, so this is safe, but you\'d have to rebuild it by hand if you change your mind.',
                values: { label: toDelete?.label },
              })
            : i18n._({
                id: "ui2.admin.scorecard.deleteplain",
                message: 'Delete field "{label}"? It has never been answered on any scorecard, so nothing is lost.',
                values: { label: toDelete?.label },
              })}
        </p>
      </ConfirmDialog>
    </>
  )
}
