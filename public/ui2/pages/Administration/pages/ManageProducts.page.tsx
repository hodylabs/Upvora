import "../components/groupB.css"
import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { Product } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button, Field, Form, TextInput, Toggle } from "../../../components/form"
import { ConfirmDialog } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"
import { ColorInput } from "../components/ColorInput"

// Products: classic's catalogue (name, permanent slug, description, brand or custom
// color, sort order, active), add and edit, the active switch per row, delete with a
// confirm that says where the ideas go, and the "General (unassigned)" count.

interface ManageProductsPageProps {
  products: Product[]
  counts: { [id: string]: number }
}

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

const bySort = (a: Product, b: Product) => a.sortOrder - b.sortOrder || a.id - b.id

interface Draft {
  id: number | null
  name: string
  slug: string
  description: string
  colorMode: "default" | "custom"
  color: string
  sortOrder: number
  isActive: boolean
}

const ManageProductsPage = (props: ManageProductsPageProps) => {
  const fider = useFider()
  const isAdmin = fider.session.user.isAdministrator
  const counts = props.counts || {}
  const [products, setProducts] = useState<Product[]>(props.products ?? [])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<Product | null>(null)
  // Products with an active-switch request in flight. One mutation per product at a time,
  // so a save never lands an activation value older than the switch.
  const [toggling, setToggling] = useState<Set<number>>(new Set())
  const isPending = (id: number | null) => id !== null && (toggling.has(id) || (busy && draft?.id === id))

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  const openAdd = () => {
    setError(undefined)
    setDraft({ id: null, name: "", slug: "", description: "", colorMode: "default", color: "#38BDF8", sortOrder: (products.length + 1) * 10, isActive: true })
  }

  const openEdit = (p: Product) => {
    setError(undefined)
    setDraft({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      colorMode: p.color === "" ? "default" : "custom",
      color: p.color || "#38BDF8",
      sortOrder: p.sortOrder,
      isActive: p.isActive,
    })
  }

  // While adding, the slug follows the name until it is edited by hand.
  const setName = (name: string) =>
    setDraft((d) => (d ? { ...d, name, slug: d.id === null && (d.slug === "" || d.slug === slugify(d.name)) ? slugify(name) : d.slug } : d))

  const save = async () => {
    if (!draft || (draft.id !== null && toggling.has(draft.id))) return
    const color = draft.colorMode === "default" ? "" : draft.color
    setBusy(true)
    if (draft.id === null) {
      const result = await actions.createProduct({ name: draft.name, slug: draft.slug, description: draft.description, color, sortOrder: draft.sortOrder })
      setBusy(false)
      if (!result.ok) return setError(result.error)
      setProducts((list) => [...list, result.data as Product].sort(bySort))
    } else {
      const id = draft.id
      // The row toggle owns activation: send its current state, not the one from when the editor opened.
      const isActive = products.find((p) => p.id === id)?.isActive ?? draft.isActive
      const input = { name: draft.name, description: draft.description, color, sortOrder: draft.sortOrder, isActive }
      const result = await actions.updateProduct(id, input)
      setBusy(false)
      if (!result.ok) return setError(result.error)
      setProducts((list) => list.map((p) => (p.id === id ? { ...p, ...input } : p)).sort(bySort))
    }
    setDraft(null)
  }

  const toggleActive = async (p: Product) => {
    if (isPending(p.id)) return
    setToggling((s) => new Set(s).add(p.id))
    const result = await actions
      .updateProduct(p.id, {
        name: p.name,
        description: p.description,
        color: p.color,
        sortOrder: p.sortOrder,
        isActive: !p.isActive,
      })
      .finally(() =>
        setToggling((s) => {
          const next = new Set(s)
          next.delete(p.id)
          return next
        })
      )
    if (result.ok) setProducts((list) => list.map((x) => (x.id === p.id ? { ...x, isActive: !p.isActive } : x)))
  }

  const remove = async () => {
    if (!deleting) return
    const result = await actions.deleteProduct(deleting.id)
    if (result.ok) setProducts((list) => list.filter((x) => x.id !== deleting.id))
    else setError(result.error)
    setDeleting(null)
  }

  const ideas = (p: Product) => counts[String(p.id)] ?? 0
  const general = counts["0"] ?? 0
  const editing = draft?.id !== null && draft !== null

  return (
    <AdminLayout
      name="products"
      title={<Trans id="ui2.admin.products.title">Products</Trans>}
      subtitle={<Trans id="ui2.admin.products.sub">Separate boards and roadmaps per product: one install, one team, one sign-in</Trans>}
    >
      {draft && (
        <div className="u2-editbox">
          <h2 className="u2-editbox__h">
            {editing ? <Trans id="ui2.admin.products.edit">Edit product</Trans> : <Trans id="ui2.admin.products.add">Add a product</Trans>}
          </h2>
          <p className="u2-admin__sub">
            {editing ? (
              <Trans id="ui2.admin.products.urlfixed">URL: /p/{draft.slug} (slug is permanent)</Trans>
            ) : (
              <Trans id="ui2.admin.products.urlnew">The slug becomes the public URL</Trans>
            )}
          </p>
          <Form error={error} onSubmit={save}>
            <TextInput name="name" label={<Trans id="ui2.admin.products.name">Name</Trans>} maxLength={60} value={draft.name} onChange={setName} />
            {!editing && (
              <TextInput
                name="slug"
                label={<Trans id="ui2.admin.products.slug">Slug (public URL: /p/&lt;slug&gt;)</Trans>}
                maxLength={60}
                value={draft.slug}
                onChange={(v) => set({ slug: slugify(v) })}
              />
            )}
            <TextInput
              name="description"
              label={<Trans id="ui2.admin.products.description">Description (optional)</Trans>}
              maxLength={200}
              value={draft.description}
              onChange={(description) => set({ description })}
            />
            <Field name="color" group label={<Trans id="ui2.admin.products.color">Color</Trans>}>
              <div className="u2-theme-row">
                <span className="u2-seg">
                  <Button small aria-pressed={draft.colorMode === "default"} onClick={() => set({ colorMode: "default" })}>
                    <Trans id="ui2.admin.products.colorbrand">Default (brand)</Trans>
                  </Button>
                  <Button small aria-pressed={draft.colorMode === "custom"} onClick={() => set({ colorMode: "custom" })}>
                    <Trans id="ui2.admin.products.colorcustom">Custom</Trans>
                  </Button>
                </span>
                {draft.colorMode === "custom" && <ColorInput label={draft.name || "Product"} value={draft.color} onChange={(color) => set({ color })} />}
              </div>
            </Field>
            <TextInput
              name="sortOrder"
              inputMode="numeric"
              label={<Trans id="ui2.admin.products.sort">Sort order (lower shows first)</Trans>}
              value={String(draft.sortOrder)}
              onChange={(v) => set({ sortOrder: parseInt(v || "0", 10) || 0 })}
            />
            <div className="u2-actions">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                <Trans id="action.cancel">Cancel</Trans>
              </Button>
              <Button type="submit" variant="primary" loading={busy} disabled={!isAdmin || (draft.id !== null && toggling.has(draft.id))}>
                {editing ? <Trans id="ui2.admin.products.savechanges">Save changes</Trans> : <Trans id="ui2.admin.products.addbtn">Add product</Trans>}
              </Button>
            </div>
          </Form>
        </div>
      )}

      {!draft && error && (
        <p className="u2-admin__note u2-admin__note--danger" role="alert">
          {error.errors?.map((e) => e.message).join(" ")}
        </p>
      )}

      <AdminSection
        title={<Trans id="ui2.admin.products.catalogue">Product catalogue</Trans>}
        lede={
          <Trans id="ui2.admin.products.cataloguehint">
            Each product gets its own board and roadmap at /p/&lt;slug&gt;; statuses, tags, and members stay shared
          </Trans>
        }
        actions={
          !draft && (
            <Button variant="primary" small onClick={openAdd}>
              <Trans id="ui2.admin.products.addone">Add a product</Trans>
            </Button>
          )
        }
      >
        <ul className="u2-alist">
          {products.map((p) => (
            <li key={p.id} className={p.isActive ? undefined : "is-off"} data-id={p.id}>
              <span className="u2-dot" style={{ "--u-dot": p.color || "var(--u-accent)" } as React.CSSProperties} aria-hidden="true" />
              <div className="u2-alist__main">
                <strong>{p.name}</strong>
                <div className="u2-alist__meta">
                  <code>/p/{p.slug}</code> · <Trans id="ui2.admin.products.ideas">{ideas(p)} ideas</Trans> ·{" "}
                  {p.color === "" ? <Trans id="ui2.admin.products.brand">brand</Trans> : <code>{p.color}</code>}
                </div>
              </div>
              <div className="u2-alist__acts">
                <Toggle
                  checked={p.isActive}
                  disabled={isPending(p.id)}
                  hideLabel
                  label={i18n._({ id: "ui2.admin.products.active", message: "Active" }) + ": " + p.name}
                  onChange={() => toggleActive(p)}
                />
                <Button small variant="ghost" onClick={() => openEdit(p)}>
                  <Trans id="action.edit">Edit</Trans>
                </Button>
                <Button small variant="danger" onClick={() => setDeleting(p)}>
                  <Trans id="action.delete">Delete</Trans>
                </Button>
              </div>
            </li>
          ))}
          {products.length === 0 && (
            <li className="u2-alist__empty">
              <Trans id="ui2.admin.products.none">No products yet. The board works exactly like a single-product site until you add one.</Trans>
            </li>
          )}
        </ul>
        {general > 0 && products.length > 0 && (
          <p className="u2-admin__sub">
            <Trans id="ui2.admin.products.general">
              <strong>General</strong> (unassigned) holds {general} ideas, visible on the all-products board.
            </Trans>
          </p>
        )}
      </AdminSection>

      <ConfirmDialog
        open={!!deleting}
        danger
        title={<Trans id="ui2.admin.products.deletetitle">Delete product</Trans>}
        confirmLabel={<Trans id="action.delete">Delete</Trans>}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      >
        {deleting &&
          (ideas(deleting) > 0 ? (
            <Trans id="ui2.admin.products.deletemoves">
              Delete &quot;{deleting.name}&quot;? Its {ideas(deleting)} ideas won&apos;t be deleted; they move to General (unassigned).
            </Trans>
          ) : (
            <Trans id="ui2.admin.products.deleteempty">Delete &quot;{deleting.name}&quot;? It has no ideas.</Trans>
          ))}
      </ConfirmDialog>
    </AdminLayout>
  )
}

export default ManageProductsPage
