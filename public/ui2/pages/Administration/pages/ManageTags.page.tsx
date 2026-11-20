import "../components/groupB.css"
import React, { useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { Tag } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { ImportTagsResult } from "@fider/services/actions/tag"
import { useFider } from "@fider/hooks"
import { Button, Field, Form, RadioGroup, TextInput } from "../../../components/form"
import { ConfirmDialog } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"

// Tags: classic's list (public first, then by name), add, edit and delete (staff;
// collaborators have full rights here), and for administrators the tags.json export
// and import.

interface ManageTagsPageProps {
  tags: Tag[]
}

export const tagSorter = (a: Tag, b: Tag) => {
  if (a.isPublic !== b.isPublic) return a.isPublic ? -1 : 1
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

type ImportTag = { name: string; color: string; isPublic: boolean }

// Reads a tags.json file the way classic does: it must be JSON and an array; the
// server validates each entry and reports per-tag errors.
export const parseTagsFile = (text: string): { tags: ImportTag[] } | { error: string } => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { error: i18n._({ id: "ui2.admin.tags.import.badjson", message: "Invalid JSON file." }) }
  }
  if (!Array.isArray(parsed)) return { error: i18n._({ id: "ui2.admin.tags.import.notarray", message: "JSON must be an array of tags." }) }
  return { tags: parsed as ImportTag[] }
}

const randomColor = () => Array.from({ length: 6 }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("")

const TagChip = (props: { tag: Pick<Tag, "name" | "color" | "slug">; link?: boolean }) => {
  const style = { "--u-chip-dot": `#${props.tag.color}` } as React.CSSProperties
  return props.link && props.tag.slug ? (
    <a className="u2-chip u2-chip--tag" style={style} href={`/?tags=${props.tag.slug}`}>
      {props.tag.name}
    </a>
  ) : (
    <span className="u2-chip u2-chip--tag" style={style}>
      {props.tag.name}
    </span>
  )
}

interface TagFormProps {
  tag?: Tag
  onSave: (name: string, color: string, isPublic: boolean) => Promise<Failure | undefined>
  onCancel: () => void
}

const TagForm = (props: TagFormProps) => {
  const [name, setName] = useState(props.tag?.name || "")
  const [color, setColor] = useState(props.tag?.color || randomColor())
  const [isPublic, setIsPublic] = useState(props.tag?.isPublic || false)
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    const failure = await props.onSave(name, color, isPublic)
    setBusy(false)
    if (failure) setError(failure)
  }

  return (
    <div className="u2-editbox">
      <Form error={error} onSubmit={save}>
        <TextInput name="name" label={<Trans id="ui2.admin.tags.name">Name</Trans>} value={name} onChange={setName} />
        <TextInput
          name="color"
          label={<Trans id="ui2.admin.tags.color">Color</Trans>}
          value={color}
          onChange={setColor}
          after={
            <Button small variant="ghost" onClick={() => setColor(randomColor())}>
              <Trans id="ui2.admin.tags.randomize">Randomize</Trans>
            </Button>
          }
        />
        <Field name="visibility" label={<Trans id="ui2.admin.tags.visibility">Visibility</Trans>} group>
          <RadioGroup<"public" | "private">
            name="visibility"
            value={isPublic ? "public" : "private"}
            onChange={(v) => setIsPublic(v === "public")}
            options={[
              { value: "public", label: <Trans id="ui2.admin.tags.public">Public</Trans> },
              { value: "private", label: <Trans id="ui2.admin.tags.private">Private</Trans> },
            ]}
          />
        </Field>
        <Field label={<Trans id="ui2.admin.tags.preview">Preview</Trans>} group>
          <span>
            <TagChip tag={{ name, color, slug: "" }} />
          </span>
        </Field>
        <div className="u2-actions">
          <Button variant="ghost" onClick={props.onCancel}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            <Trans id="action.save">Save</Trans>
          </Button>
        </div>
      </Form>
    </div>
  )
}

const ManageTagsPage = (props: ManageTagsPageProps) => {
  const fider = useFider()
  const canEdit = fider.session.user.isCollaborator
  const [tags, setTags] = useState<Tag[]>([...(props.tags || [])].sort(tagSorter))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)
  const [deleting, setDeleting] = useState<Tag | null>(null)
  const [importStatus, setImportStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [importResult, setImportResult] = useState<ImportTagsResult | undefined>()
  const [importError, setImportError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const create = async (name: string, color: string, isPublic: boolean) => {
    const result = await actions.createTag(name, color, isPublic)
    if (!result.ok) return result.error
    setAdding(false)
    setTags((list) => [...list, result.data].sort(tagSorter))
  }

  const update = (tag: Tag) => async (name: string, color: string, isPublic: boolean) => {
    const result = await actions.updateTag(tag.slug, name, color, isPublic)
    if (!result.ok) return result.error
    setEditing(null)
    setTags((list) => list.map((t) => (t.id === tag.id ? { ...t, ...result.data } : t)).sort(tagSorter))
  }

  const remove = async () => {
    if (!deleting) return
    const result = await actions.deleteTag(deleting.slug)
    if (result.ok) setTags((list) => list.filter((t) => t.id !== deleting.id))
    setDeleting(null)
  }

  const importFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const file = input.files?.[0]
    if (!file) return
    setImportStatus("loading")
    setImportResult(undefined)
    setImportError("")
    try {
      const parsed = parseTagsFile(await file.text())
      if ("error" in parsed) {
        setImportStatus("error")
        setImportError(parsed.error)
      } else {
        const result = await actions.importTags(parsed.tags)
        if (result.ok) {
          setImportStatus("success")
          setImportResult(result.data)
        } else {
          setImportStatus("error")
          setImportError(i18n._({ id: "ui2.admin.tags.import.failed", message: "Import failed. Please check the file format." }))
        }
      }
    } catch {
      setImportStatus("error")
      setImportError(i18n._({ id: "ui2.admin.tags.import.unexpected", message: "An unexpected error occurred." }))
    }
    // So the same file can be picked again.
    input.value = ""
  }

  return (
    <AdminLayout name="tags" title={<Trans id="ui2.admin.tags.title">Tags</Trans>} subtitle={<Trans id="ui2.admin.tags.sub">Manage your site tags</Trans>}>
      <AdminSection
        title={<Trans id="ui2.admin.tags.list">All tags</Trans>}
        actions={
          canEdit &&
          !adding && (
            <Button small variant="primary" onClick={() => (setAdding(true), setEditing(null))}>
              <Trans id="ui2.admin.tags.add">Add new tag</Trans>
            </Button>
          )
        }
      >
        {adding && <TagForm onSave={create} onCancel={() => setAdding(false)} />}
        <ul className="u2-alist">
          {tags.length === 0 && (
            <li className="u2-alist__empty">
              <Trans id="ui2.admin.tags.none">There aren&apos;t any tags yet.</Trans>
            </li>
          )}
          {tags.map((tag) =>
            editing === tag.id ? (
              <li key={tag.id}>
                <div className="u2-alist__main">
                  <TagForm tag={tag} onSave={update(tag)} onCancel={() => setEditing(null)} />
                </div>
              </li>
            ) : (
              <li key={tag.id} data-id={tag.id}>
                <div className="u2-alist__main">
                  <TagChip tag={tag} link />
                </div>
                <span className="u2-chip">
                  {tag.isPublic ? <Trans id="ui2.admin.tags.publicchip">public</Trans> : <Trans id="ui2.admin.tags.privatechip">private</Trans>}
                </span>
                {canEdit && (
                  <div className="u2-alist__acts">
                    <Button small variant="ghost" onClick={() => (setEditing(tag.id), setAdding(false))}>
                      <Trans id="action.edit">Edit</Trans>
                    </Button>
                    <Button small variant="danger" onClick={() => setDeleting(tag)}>
                      <Trans id="action.delete">Delete</Trans>
                    </Button>
                  </div>
                )}
              </li>
            )
          )}
        </ul>
      </AdminSection>

      {fider.session.user.isAdministrator && (
        <AdminSection
          title={<Trans id="ui2.admin.tags.io">Import &amp; Export Tags</Trans>}
          lede={
            <Trans id="ui2.admin.tags.iohint">
              Download all your tags as a JSON file, or upload a <code>tags.json</code> file to restore or add tags. Existing tags with the same name will be
              skipped.
            </Trans>
          }
        >
          <div className="u2-row">
            <a className="u2-btn u2-btn--secondary" href="/admin/export/tags.json">
              <Trans id="ui2.admin.tags.export">Export tags.json</Trans>
            </a>
            <input
              ref={fileRef}
              className="u2-upload__file"
              type="file"
              accept=".json,application/json"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="u2-tags-file"
              onChange={importFile}
              disabled={importStatus === "loading"}
            />
            <Button onClick={() => fileRef.current?.click()} loading={importStatus === "loading"}>
              {importStatus === "loading" ? <Trans id="ui2.admin.tags.importing">Importing</Trans> : <Trans id="ui2.admin.tags.import">Import tags.json</Trans>}
            </Button>
          </div>
          <div role="status">
            {importStatus === "success" && importResult && (
              <div className="u2-admin__note">
                <Trans id="ui2.admin.tags.imported">
                  Import complete: <strong>{importResult.created}</strong> tag(s) created, <strong>{importResult.skipped}</strong> skipped.
                </Trans>
                {importResult.errors && importResult.errors.length > 0 && (
                  <ul className="u2-fld__error">
                    {importResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {importStatus === "error" && <p className="u2-admin__note u2-admin__note--danger">{importError}</p>}
          </div>
        </AdminSection>
      )}

      <ConfirmDialog
        open={!!deleting}
        danger
        title={<Trans id="ui2.admin.tags.sure">Are you sure?</Trans>}
        confirmLabel={<Trans id="ui2.admin.tags.deletetag">Delete tag</Trans>}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      >
        {deleting && (
          <Trans id="ui2.admin.tags.deletebody">
            The tag <TagChip tag={deleting} /> will be removed from all posts.
          </Trans>
        )}
      </ConfirmDialog>
    </AdminLayout>
  )
}

export default ManageTagsPage
