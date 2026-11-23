import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Tag, statusListFor } from "@fider/models"
import { useFider } from "@fider/hooks"
import { statusInfo } from "../../lib/status"
import { Menu } from "../../components/Menu"
import { BoardFilter } from "./filter"

interface BoardControlsProps {
  filter: BoardFilter
  onChange: (patch: Partial<BoardFilter>) => void
  countPerStatus: { [key: string]: number }
  countPerProduct?: { [id: string]: number }
  tags: Tag[]
  scoped: boolean // a product board: no product filter
}

// The first three show as a segmented control, the rest go in a menu.
const SORTS = [
  { value: "trending", id: "home.postfilter.option.trending", message: "Trending" },
  { value: "most-wanted", id: "home.postfilter.option.mostwanted", message: "Most Wanted" },
  { value: "recent", id: "home.postfilter.option.recent", message: "Recent" },
  { value: "most-discussed", id: "home.postfilter.option.mostdiscussed", message: "Most Discussed" },
]
const SHOWN_SORTS = 3

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

interface ChipMenuProps {
  label: string
  // Names of what is picked; the chip shows one name, or the count for more.
  picked: string[]
  children: React.ReactNode
}

// An add-a-filter chip: dashed when empty, solid with the pick when set; opens a checklist.
const ChipMenu = (props: ChipMenuProps) => {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setOpen(false)
      button.current?.focus()
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const n = props.picked.length
  return (
    <div className="u2-menu" ref={wrap}>
      <button ref={button} type="button" className={`u2-fchip${n ? " is-set" : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {n === 0 ? `+ ${props.label}` : n === 1 ? `${props.label}: ${props.picked[0]}` : props.label}
        {n > 1 && <span className="u2-count">{n}</span>}
      </button>
      {open && <div className="u2-filters u2-panel">{props.children}</div>}
    </div>
  )
}

// The controls row: the view's name, add-a-filter chips, List / By stage, and the sort.
export const BoardControls = (props: BoardControlsProps) => {
  const fider = useFider()
  const { filter } = props
  const tenant = fider.session.tenant
  const signedIn = fider.session.isAuthenticated
  const staff = signedIn && fider.session.user.isCollaborator
  const statuses = statusListFor(tenant).filter((s) => s.filterable)
  const stage = filter.layout === "stage"

  const labelOf = (slug: string) => statusInfo(tenant, slug).label
  const check = (key: string, label: string, checked: boolean, onToggle: () => void, count?: number) => (
    <label key={key} className="u2-check">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span>{label}</span>
      {!!count && <span className="u2-muted u2-mono">{count}</span>}
    </label>
  )

  const products = props.scoped ? [] : tenant.products || []
  const sort = filter.view || "trending"
  const extra = SORTS.slice(SHOWN_SORTS)
  const extraOn = !SORTS.slice(0, SHOWN_SORTS).some((s) => s.value === sort)
  const sortName = (v: string) => {
    const s = SORTS.find((x) => x.value === v)
    return s ? i18n._({ id: s.id, message: s.message }) : v
  }

  const pseudo: { [slug: string]: string } = {
    pending: i18n._({ id: "ui2.filter.pending", message: "Pending" }),
    private: i18n._({ id: "post.private", message: "Private" }),
  }
  const statusPicked = filter.statuses.map((s) => pseudo[s] || labelOf(s))
  const productPicked = products.filter((p) => filter.products.includes(p.id)).map((p) => p.name)
  const tagPicked = filter.noTags
    ? [i18n._({ id: "home.postfilter.option.notags", message: "Untagged" })]
    : props.tags.filter((t) => filter.tags.includes(t.slug)).map((t) => t.name)

  const title = filter.myVotes ? (
    <Trans id="ui2.shell.myvotes">My votes</Trans>
  ) : filter.myPosts ? (
    <Trans id="ui2.shell.myposts">My ideas</Trans>
  ) : (
    <Trans id="ui2.board.allideas">All ideas</Trans>
  )

  return (
    <div className="u2-controls">
      <h2 className="u2-controls__h">{title}</h2>
      <div className="u2-controls__chips">
        {!stage && (
          <ChipMenu label={i18n._({ id: "home.postfilter.label.status", message: "Status" })} picked={statusPicked}>
            {statuses.map((s) =>
              check(
                `s:${s.value}`,
                labelOf(s.value),
                filter.statuses.includes(s.value),
                () => props.onChange({ statuses: toggle(filter.statuses, s.value) }),
                props.countPerStatus[s.value]
              )
            )}
            {staff &&
              check("s:pending", pseudo.pending, filter.statuses.includes("pending"), () => props.onChange({ statuses: toggle(filter.statuses, "pending") }))}
            {staff &&
              check("s:private", pseudo.private, filter.statuses.includes("private"), () => props.onChange({ statuses: toggle(filter.statuses, "private") }))}
          </ChipMenu>
        )}
        {products.length > 0 && (
          <ChipMenu label={i18n._({ id: "ui2.filter.product", message: "Product" })} picked={productPicked}>
            {products.map((p) =>
              check(
                `p:${p.id}`,
                p.name,
                filter.products.includes(p.id),
                () => props.onChange({ products: toggle(filter.products, p.id) }),
                props.countPerProduct?.[String(p.id)]
              )
            )}
          </ChipMenu>
        )}
        {props.tags.length > 0 && (
          <ChipMenu label={i18n._({ id: "ui2.filter.tag", message: "Tag" })} picked={tagPicked}>
            {/* Untagged and concrete tags are mutually exclusive, as in classic. */}
            {check("notags", i18n._({ id: "home.postfilter.option.notags", message: "Untagged" }), filter.noTags, () =>
              props.onChange({ noTags: !filter.noTags, tags: filter.noTags ? filter.tags : [] })
            )}
            {props.tags.map((t) =>
              check(`t:${t.slug}`, t.name, filter.tags.includes(t.slug), () => props.onChange({ tags: toggle(filter.tags, t.slug), noTags: false }))
            )}
          </ChipMenu>
        )}
        {signedIn && (
          <button
            type="button"
            className={`u2-fchip${filter.myVotes ? " is-set" : ""}`}
            aria-pressed={filter.myVotes}
            onClick={() => props.onChange({ myVotes: !filter.myVotes })}
          >
            <Trans id="ui2.shell.myvotes">My votes</Trans>
          </button>
        )}
        {signedIn && (
          <button
            type="button"
            className={`u2-fchip${filter.myPosts ? " is-set" : ""}`}
            aria-pressed={filter.myPosts}
            onClick={() => props.onChange({ myPosts: !filter.myPosts })}
          >
            <Trans id="ui2.shell.myposts">My ideas</Trans>
          </button>
        )}
      </div>
      <div className="u2-controls__end">
        <div className="u2-seg" role="group" aria-label={i18n._({ id: "ui2.board.layout", message: "Layout" })}>
          <button type="button" aria-pressed={!stage} onClick={() => props.onChange({ layout: "" })}>
            <Trans id="ui2.board.list">List</Trans>
          </button>
          {/* The groups are the status filter in this view, so status picks are cleared. */}
          <button type="button" aria-pressed={stage} onClick={() => props.onChange({ layout: "stage", statuses: [] })}>
            <Trans id="ui2.board.bystage">By stage</Trans>
          </button>
        </div>
        {!filter.query && (
          <div className="u2-seg" role="group" aria-label={i18n._({ id: "ui2.board.sort", message: "Sort" })}>
            {SORTS.slice(0, SHOWN_SORTS).map((s) => (
              <button key={s.value} type="button" aria-pressed={sort === s.value} onClick={() => props.onChange({ view: s.value })}>
                {i18n._({ id: s.id, message: s.message })}
              </button>
            ))}
            <Menu
              className="u2-menu u2-seg__more"
              triggerClassName={extraOn ? "is-on" : undefined}
              trigger={
                <>
                  {extraOn ? sortName(sort) : <Trans id="ui2.board.more">More</Trans>}
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </>
              }
              items={extra.map((s) => ({ key: s.value, label: sortName(s.value), onSelect: () => props.onChange({ view: s.value }) }))}
            />
          </div>
        )}
      </div>
    </div>
  )
}
