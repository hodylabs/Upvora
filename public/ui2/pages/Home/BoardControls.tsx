import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Tag, statusListFor } from "@fider/models"
import { useFider } from "@fider/hooks"
import { statusInfo } from "../../lib/status"
import { BoardFilter, activeFilterCount } from "./filter"

interface BoardControlsProps {
  filter: BoardFilter
  onChange: (patch: Partial<BoardFilter>) => void
  countPerStatus: { [key: string]: number }
  countPerProduct?: { [id: string]: number }
  tags: Tag[]
  scoped: boolean // a product board: no product filter
}

const SORTS = [
  { value: "trending", id: "home.postfilter.option.trending", message: "Trending" },
  { value: "most-wanted", id: "home.postfilter.option.mostwanted", message: "Most Wanted" },
  { value: "most-discussed", id: "home.postfilter.option.mostdiscussed", message: "Most Discussed" },
  { value: "recent", id: "home.postfilter.option.recent", message: "Recent" },
]

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

// Status tabs with counts, the sort, and the filter menu (my votes, my posts,
// statuses incl. staff-only pending and private, products, untagged, tags).
export const BoardControls = (props: BoardControlsProps) => {
  const fider = useFider()
  const { filter } = props
  const tenant = fider.session.tenant
  const signedIn = fider.session.isAuthenticated
  const staff = signedIn && fider.session.user.isCollaborator
  const statuses = statusListFor(tenant).filter((s) => s.filterable)
  const total = Object.entries(props.countPerStatus)
    .filter(([slug]) => slug !== "deleted")
    .reduce((a, [, n]) => a + n, 0)

  const [open, setOpen] = useState(false)
  const [find, setFind] = useState("")
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const labelOf = (slug: string) => statusInfo(tenant, slug).label
  const onlyStatus = filter.statuses.length === 1 ? filter.statuses[0] : null
  const matches = (label: string) => label.toLowerCase().includes(find.toLowerCase())

  const check = (key: string, label: string, checked: boolean, onToggle: () => void, count?: number) =>
    matches(label) && (
      <label key={key} className="u2-check">
        <input type="checkbox" checked={checked} onChange={onToggle} />
        <span>{label}</span>
        {!!count && <span className="u2-muted u2-mono">{count}</span>}
      </label>
    )

  const products = props.scoped ? [] : tenant.products || []
  const sortKnown = SORTS.some((s) => s.value === (filter.view || "trending"))
  const count = activeFilterCount(filter)

  return (
    <div className="u2-controls">
      <div className="u2-tabs" role="group" aria-label={i18n._({ id: "ui2.board.bystatus", message: "Status" })}>
        <button type="button" className="u2-tab" aria-pressed={filter.statuses.length === 0} onClick={() => props.onChange({ statuses: [] })}>
          <Trans id="ui2.board.all">All</Trans>
          <span className="u2-mono u2-tab__n">{total}</span>
        </button>
        {statuses.map((s) => (
          <button
            key={s.value}
            type="button"
            className="u2-tab"
            aria-pressed={onlyStatus === s.value}
            onClick={() => props.onChange({ statuses: onlyStatus === s.value ? [] : [s.value] })}
          >
            {labelOf(s.value)}
            <span className="u2-mono u2-tab__n">{props.countPerStatus[s.value] || 0}</span>
          </button>
        ))}
      </div>
      <div className="u2-controls__end">
        {!filter.query && (
          <label className="u2-sort">
            <span className="u2-muted">
              <Trans id="ui2.board.sort">Sort</Trans>
            </span>
            <select value={filter.view || "trending"} onChange={(e) => props.onChange({ view: e.target.value })}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {i18n._({ id: s.id, message: s.message })}
                </option>
              ))}
              {!sortKnown && <option value={filter.view}>{filter.view}</option>}
            </select>
          </label>
        )}
        <div className="u2-menu" ref={menuRef}>
          <button type="button" className="u2-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)}>
            <svg className="u2-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            <Trans id="home.filter.label">Filter</Trans>
            {count > 0 && <span className="u2-count">{count}</span>}
          </button>
          {open && (
            <div className="u2-filters u2-panel">
              <label className="u2-sr" htmlFor="u2-filter-find">
                <Trans id="ui2.filter.find">Find a filter</Trans>
              </label>
              <input
                id="u2-filter-find"
                className="u2-input"
                type="text"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder={i18n._({ id: "home.filter.search.label", message: "Search in filters..." })}
              />
              {signedIn && (
                <fieldset>
                  <legend>{i18n._({ id: "home.postfilter.label.myactivity", message: "My activity" })}</legend>
                  {check("myvotes", i18n._({ id: "home.postfilter.option.myvotes", message: "My Votes" }), filter.myVotes, () =>
                    props.onChange({ myVotes: !filter.myVotes })
                  )}
                  {check("myposts", i18n._({ id: "home.postfilter.option.myposts", message: "My Posts" }), filter.myPosts, () =>
                    props.onChange({ myPosts: !filter.myPosts })
                  )}
                </fieldset>
              )}
              <fieldset>
                <legend>{i18n._({ id: "home.postfilter.label.status", message: "Status" })}</legend>
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
                  check("s:pending", i18n._({ id: "ui2.filter.pending", message: "Pending" }), filter.statuses.includes("pending"), () =>
                    props.onChange({ statuses: toggle(filter.statuses, "pending") })
                  )}
                {staff &&
                  check("s:private", i18n._({ id: "post.private", message: "Private" }), filter.statuses.includes("private"), () =>
                    props.onChange({ statuses: toggle(filter.statuses, "private") })
                  )}
              </fieldset>
              {products.length > 0 && (
                <fieldset>
                  <legend>{i18n._({ id: "home.postfilter.label.products", message: "Products" })}</legend>
                  {products.map((p) =>
                    check(
                      `p:${p.id}`,
                      p.name,
                      filter.products.includes(p.id),
                      () => props.onChange({ products: toggle(filter.products, p.id) }),
                      props.countPerProduct?.[String(p.id)]
                    )
                  )}
                </fieldset>
              )}
              {props.tags.length > 0 && (
                <fieldset>
                  <legend>{i18n._({ id: "label.tags", message: "Tags" })}</legend>
                  {/* Untagged and concrete tags are mutually exclusive, as in classic. */}
                  {check("notags", i18n._({ id: "home.postfilter.option.notags", message: "Untagged" }), filter.noTags, () =>
                    props.onChange({ noTags: !filter.noTags, tags: filter.noTags ? filter.tags : [] })
                  )}
                  {props.tags.map((t) =>
                    check(`t:${t.slug}`, t.name, filter.tags.includes(t.slug), () => props.onChange({ tags: toggle(filter.tags, t.slug), noTags: false }))
                  )}
                </fieldset>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
