import "../components/groupB.css"
import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { Status, StatusKind } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { Button, Form, Select, SelectOption, TextInput, Toggle, Field } from "../../../components/form"
import { ConfirmDialog, toast } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"
import { slugify as productSlug } from "./ManageProducts.page"

// Statuses: classic's catalogue. Built-in (system) statuses can be renamed,
// recolored, reordered or deactivated, never deleted; custom ones can be added
// (slug and kind fixed after creation) and deleted (the server refuses while
// posts still use them).

interface ManageStatusesPageProps {
  statuses: Status[]
}

const slugify = (s: string) => productSlug(s).slice(0, 50)

const kindOptions = (): SelectOption[] => [
  { value: "open", label: i18n._({ id: "ui2.admin.statuses.kind.open", message: "Open: default initial state" }) },
  { value: "active", label: i18n._({ id: "ui2.admin.statuses.kind.active", message: "Active: accepted, in progress" }) },
  { value: "closed-completed", label: i18n._({ id: "ui2.admin.statuses.kind.completed", message: "Closed (completed): done, positive resolution" }) },
  { value: "closed-declined", label: i18n._({ id: "ui2.admin.statuses.kind.declined", message: "Closed (declined): closed without action" }) },
  { value: "duplicate", label: i18n._({ id: "ui2.admin.statuses.kind.duplicate", message: "Duplicate: merged into another post" }) },
]

const colorOptions = (): SelectOption[] => [
  { value: "blue", label: i18n._({ id: "admin.statuses.color.blue", message: "Blue" }) },
  { value: "green", label: i18n._({ id: "admin.statuses.color.green", message: "Green" }) },
  { value: "yellow", label: i18n._({ id: "admin.statuses.color.yellow", message: "Yellow" }) },
  { value: "red", label: i18n._({ id: "admin.statuses.color.red", message: "Red" }) },
  { value: "gray", label: i18n._({ id: "admin.statuses.color.gray", message: "Gray" }) },
]

const colorVar: { [c: string]: string } = {
  blue: "var(--u-s-planned)",
  green: "var(--u-s-shipped)",
  yellow: "var(--u-warn)",
  red: "var(--u-danger)",
  gray: "var(--u-s-review)",
}

export const ordered = (list: Status[]): Status[] => [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)

// The sortOrder that puts a status just above (-1) or below (+1) its visible
// neighbor, as classic: one update per click, and it works even when both rows share
// the same sortOrder. null when there is no neighbor on that side.
export const moveSortOrder = (list: Status[], id: number, direction: -1 | 1): number | null => {
  const rows = ordered(list)
  const idx = rows.findIndex((s) => s.id === id)
  const neighbor = rows[idx + direction]
  if (idx < 0 || !neighbor) return null
  return direction === -1 ? neighbor.sortOrder - 1 : neighbor.sortOrder + 1
}

const updateInput = (s: Status) => ({
  label: s.label,
  color: s.color,
  icon: s.icon,
  showOnHome: s.showOnHome,
  showOnRoadmap: s.showOnRoadmap,
  filterable: s.filterable,
  sortOrder: s.sortOrder,
  isActive: s.isActive,
})

interface Draft {
  id: number | null
  slug: string
  label: string
  kind: StatusKind
  color: string
  icon: string
  showOnHome: boolean
  showOnRoadmap: boolean
  filterable: boolean
  sortOrder: number
}

const blank = (): Draft => ({
  id: null,
  slug: "",
  label: "",
  kind: "open",
  color: "blue",
  icon: "lightbulb",
  showOnHome: true,
  showOnRoadmap: false,
  filterable: true,
  sortOrder: 100,
})

const ManageStatusesPage = (props: ManageStatusesPageProps) => {
  const [statuses, setStatuses] = useState<Status[]>(ordered(props.statuses ?? []))
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<Status | null>(null)

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))
  const open = (d: Draft) => {
    setError(undefined)
    setDraft(d)
  }

  const setLabel = (label: string) => setDraft((d) => (d ? { ...d, label, slug: !d.slug || d.slug === slugify(d.label) ? slugify(label) : d.slug } : d))

  const save = async () => {
    if (!draft) return
    setBusy(true)
    setError(undefined)
    const fields = {
      label: draft.label,
      color: draft.color,
      icon: draft.icon,
      showOnHome: draft.showOnHome,
      showOnRoadmap: draft.showOnRoadmap,
      filterable: draft.filterable,
      sortOrder: draft.sortOrder,
    }
    if (draft.id !== null) {
      const id = draft.id
      const existing = statuses.find((s) => s.id === id)
      const result = await actions.updateStatus(id, { ...fields, isActive: existing ? existing.isActive : true })
      setBusy(false)
      if (!result.ok) return setError(result.error)
      setStatuses((list) => ordered(list.map((s) => (s.id === id ? { ...s, ...fields } : s))))
    } else {
      const result = await actions.createStatus({ ...fields, slug: draft.slug, kind: draft.kind })
      setBusy(false)
      if (!result.ok) return setError(result.error)
      setStatuses((list) => ordered([...list, result.data]))
    }
    setDraft(null)
  }

  const toggleActive = async (s: Status) => {
    const result = await actions.updateStatus(s.id, { ...updateInput(s), isActive: !s.isActive })
    if (result.ok) setStatuses((list) => list.map((x) => (x.id === s.id ? { ...x, isActive: !s.isActive } : x)))
  }

  const move = async (s: Status, direction: -1 | 1) => {
    const sortOrder = moveSortOrder(statuses, s.id, direction)
    if (sortOrder === null) return
    const updated = { ...s, sortOrder }
    const result = await actions.updateStatus(s.id, updateInput(updated))
    if (result.ok) setStatuses((list) => ordered(list.map((x) => (x.id === s.id ? updated : x))))
  }

  const remove = async () => {
    const s = deleting
    if (!s || s.isSystem) return setDeleting(null)
    const result = await actions.deleteStatus(s.id)
    setDeleting(null)
    if (result.ok) setStatuses((list) => list.filter((x) => x.id !== s.id))
    else toast.error(result.error?.errors?.[0]?.message ?? i18n._({ id: "admin.statuses.delete.failed", message: "Could not delete this status." }))
  }

  const yes = i18n._({ id: "ui2.admin.statuses.yes", message: "yes" })
  const no = i18n._({ id: "ui2.admin.statuses.no", message: "no" })

  return (
    <AdminLayout
      name="statuses"
      title={<Trans id="admin.statuses.page.title">Statuses</Trans>}
      subtitle={<Trans id="admin.statuses.page.subtitle">Customize the list of post statuses your admins can apply</Trans>}
    >
      {draft && (
        <div className="u2-editbox">
          <h2 className="u2-editbox__h">
            {draft.id === null ? <Trans id="ui2.admin.statuses.addtitle">Add a status</Trans> : <Trans id="ui2.admin.statuses.edittitle">Edit status</Trans>}
          </h2>
          <Form error={error} onSubmit={save}>
            <TextInput name="label" label={i18n._({ id: "admin.statuses.form.label", message: "Label" })} value={draft.label} onChange={setLabel} />
            {draft.id === null ? (
              <>
                <TextInput
                  name="slug"
                  label={i18n._({ id: "admin.statuses.form.slug", message: "Slug (URL-safe)" })}
                  value={draft.slug}
                  onChange={(v) => set({ slug: slugify(v) })}
                />
                <Select
                  name="kind"
                  label={i18n._({ id: "admin.statuses.form.kind", message: "Semantic kind" })}
                  value={draft.kind}
                  options={kindOptions()}
                  onChange={(v) => set({ kind: (v || "open") as StatusKind })}
                />
              </>
            ) : (
              <p className="u2-admin__sub">
                <Trans id="admin.statuses.form.lockednote">
                  Slug <code>{draft.slug}</code> and semantic kind <code>{draft.kind}</code> are fixed once a status is created.
                </Trans>
              </p>
            )}
            <Select
              name="color"
              label={i18n._({ id: "admin.statuses.form.color", message: "Color" })}
              value={draft.color}
              options={colorOptions()}
              onChange={(v) => set({ color: v || "blue" })}
            />
            <Field label={<Trans id="ui2.admin.statuses.visibility">Where it shows</Trans>} group>
              <Toggle
                checked={draft.showOnHome}
                onChange={(showOnHome) => set({ showOnHome })}
                label={<Trans id="admin.statuses.form.showonhome">Show posts in this status on the home page</Trans>}
              />
              <Toggle
                checked={draft.showOnRoadmap}
                onChange={(showOnRoadmap) => set({ showOnRoadmap })}
                label={<Trans id="admin.statuses.form.showonroadmap">Publish posts in this status to the Roadmap page</Trans>}
              />
              <Toggle
                checked={draft.filterable}
                onChange={(filterable) => set({ filterable })}
                label={<Trans id="admin.statuses.form.filterable">Include this status in the home-page filter</Trans>}
              />
            </Field>
            <div className="u2-actions">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                <Trans id="action.cancel">Cancel</Trans>
              </Button>
              <Button type="submit" variant="primary" loading={busy}>
                {draft.id === null ? <Trans id="admin.statuses.form.save">Save status</Trans> : <Trans id="admin.statuses.form.update">Update status</Trans>}
              </Button>
            </div>
          </Form>
        </div>
      )}

      <AdminSection
        title={<Trans id="admin.statuses.catalogue">Status catalogue</Trans>}
        lede={
          <Trans id="ui2.admin.statuses.help">
            Built-in statuses can be renamed, recolored, or deactivated, never deleted. Add custom ones for your own workflow.
          </Trans>
        }
        actions={
          !draft && (
            <Button small variant="primary" onClick={() => open(blank())}>
              <Trans id="ui2.admin.statuses.add">Add a status</Trans>
            </Button>
          )
        }
      >
        <ul className="u2-alist">
          {statuses.map((s, i) => (
            <li key={s.id} className={s.isActive ? undefined : "is-off"} data-id={s.id}>
              <span className="u2-order">
                <Button
                  small
                  variant="ghost"
                  disabled={i === 0}
                  aria-label={i18n._({ id: "ui2.admin.statuses.up", message: "Move up" }) + ": " + s.label}
                  onClick={() => move(s, -1)}
                >
                  <span aria-hidden="true">↑</span>
                </Button>
                <Button
                  small
                  variant="ghost"
                  disabled={i === statuses.length - 1}
                  aria-label={i18n._({ id: "ui2.admin.statuses.down", message: "Move down" }) + ": " + s.label}
                  onClick={() => move(s, 1)}
                >
                  <span aria-hidden="true">↓</span>
                </Button>
              </span>
              <span className="u2-dot" style={{ "--u-dot": colorVar[s.color] || colorVar.gray } as React.CSSProperties} title={s.color} aria-hidden="true" />
              <div className="u2-alist__main">
                <strong>{s.label}</strong>{" "}
                {s.isSystem && (
                  <span className="u2-chip" title="system status">
                    sys
                  </span>
                )}
                <div className="u2-alist__meta">
                  <code>{s.slug}</code> · {s.kind} · <Trans id="admin.statuses.table.home">Home</Trans> {s.showOnHome ? yes : no} ·{" "}
                  <Trans id="admin.statuses.table.roadmap">Roadmap</Trans> {s.showOnRoadmap ? yes : no} · <Trans id="admin.statuses.table.filter">Filter</Trans>{" "}
                  {s.filterable ? yes : no}
                </div>
              </div>
              <div className="u2-alist__acts">
                <Toggle
                  checked={s.isActive}
                  hideLabel
                  label={i18n._({ id: "admin.statuses.table.active", message: "Active" }) + ": " + s.label}
                  onChange={() => toggleActive(s)}
                />
                <Button small variant="ghost" onClick={() => open({ ...s, id: s.id })}>
                  <Trans id="admin.statuses.action.edit">Edit</Trans>
                </Button>
                {!s.isSystem && (
                  <Button small variant="danger" onClick={() => setDeleting(s)}>
                    <Trans id="admin.statuses.action.delete">Delete</Trans>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </AdminSection>

      <ConfirmDialog
        open={!!deleting}
        danger
        title={<Trans id="ui2.admin.statuses.deletetitle">Delete status</Trans>}
        confirmLabel={<Trans id="admin.statuses.action.delete">Delete</Trans>}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      >
        {deleting &&
          i18n._({
            id: "admin.statuses.delete.confirm",
            values: { label: deleting.label },
            message: 'Delete the "{label}" status? Posts already using it must be reassigned first.',
          })}
      </ConfirmDialog>
    </AdminLayout>
  )
}

export default ManageStatusesPage
