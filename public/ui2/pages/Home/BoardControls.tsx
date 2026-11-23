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
  tags: Tag[]
  // Staff with Team view on: the Pending and Private filters.
  teamView: boolean
}

// The server's sort values (app/handlers/post.go); "trending" is its default and reads as Rising.
export const SORTS = [
  { value: "most-wanted", id: "ui2.sort.mostwanted", message: "Most wanted" },
  { value: "trending", id: "ui2.sort.rising", message: "Rising" },
  { value: "recent", id: "ui2.sort.newest", message: "Newest" },
  { value: "most-discussed", id: "ui2.sort.mostdiscussed", message: "Most discussed" },
]
export const DEFAULT_SORT = "trending"
const SHOWN_STAGES = 4

const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

// The tag picker: a checklist under a "+ Tag" chip, solid once something is picked.
const TagMenu = (props: { label: string; picked: string[]; children: React.ReactNode }) => {
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
      <button ref={button} type="button" className={`u2-fchip${n ? " is-on" : " is-add"}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {n === 0 ? `+ ${props.label}` : n === 1 ? `${props.label}: ${props.picked[0]}` : props.label}
        {n > 1 && <span className="u2-fchip__n u2-mono">{n}</span>}
      </button>
      {open && <div className="u2-filters u2-panel">{props.children}</div>}
    </div>
  )
}

// The filters row: the view's name, stage chips, + Tag, staff Pending, layout and sort.
export const BoardControls = (props: BoardControlsProps) => {
  const fider = useFider()
  const { filter } = props
  const tenant = fider.session.tenant
  const stage = filter.layout === "stage"
  const stages = statusListFor(tenant).filter((s) => s.filterable)
  const shown = stages.slice(0, SHOWN_STAGES)
  const rest = stages.slice(SHOWN_STAGES)
  const labelOf = (slug: string) => statusInfo(tenant, slug).label
  // Stage chips pick one stage; Pending and Private stack on top of it.
  const pseudo = filter.statuses.filter((s) => s === "pending" || s === "private")
  const picked = filter.statuses.filter((s) => s !== "pending" && s !== "private")
  const pickStage = (slug: string) => props.onChange({ statuses: [...(picked.length === 1 && picked[0] === slug ? [] : [slug]), ...pseudo] })
  const restOn = picked.find((s) => rest.some((r) => r.value === s))
  const sort = filter.view || DEFAULT_SORT

  const count = (slug: string) => props.countPerStatus[slug]
  const chip = (key: string, on: boolean, label: React.ReactNode, onClick: () => void, n?: number) => (
    <button key={key} type="button" className={`u2-fchip${on ? " is-on" : ""}`} aria-pressed={on} onClick={onClick}>
      {label}
      {!!n && <span className="u2-fchip__n u2-mono">{n}</span>}
    </button>
  )

  const untagged = i18n._({ id: "home.postfilter.option.notags", message: "Untagged" })
  const tagPicked = filter.noTags ? [untagged] : props.tags.filter((t) => filter.tags.includes(t.slug)).map((t) => t.name)
  const check = (key: string, label: string, checked: boolean, onToggle: () => void) => (
    <label key={key} className="u2-check">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span>{label}</span>
    </label>
  )

  const title = filter.myVotes ? (
    <Trans id="ui2.shell.myvotes">My votes</Trans>
  ) : filter.myPosts ? (
    <Trans id="ui2.shell.myposts">My ideas</Trans>
  ) : (
    <Trans id="ui2.board.ideas">Ideas</Trans>
  )

  return (
    <div className="u2-controls">
      <h2 className="u2-controls__h" data-view={filter.myVotes ? "myvotes" : filter.myPosts ? "myposts" : "all"}>
        {title}
      </h2>
      <div className="u2-controls__chips">
        {!stage && (
          <>
            {chip("all", picked.length === 0, <Trans id="ui2.filter.all">All</Trans>, () => props.onChange({ statuses: pseudo }))}
            {shown.map((s) => chip(s.value, picked.length === 1 && picked[0] === s.value, labelOf(s.value), () => pickStage(s.value), count(s.value)))}
            {(rest.length > 0 || props.teamView) && (
              <Menu
                className="u2-menu"
                triggerClassName={`u2-fchip${restOn ? " is-on" : " is-add"}`}
                trigger={restOn ? labelOf(restOn) : <Trans id="ui2.filter.morestages">More stages</Trans>}
                items={[
                  ...rest.map((s) => ({ key: s.value, label: labelOf(s.value), onSelect: () => pickStage(s.value) })),
                  ...(props.teamView
                    ? [
                        {
                          key: "private",
                          label: i18n._({ id: "post.private", message: "Private" }),
                          onSelect: () => props.onChange({ statuses: toggle(filter.statuses, "private") }),
                        },
                      ]
                    : []),
                ]}
              />
            )}
          </>
        )}
        {props.tags.length > 0 && (
          <TagMenu label={i18n._({ id: "ui2.filter.tag", message: "Tag" })} picked={tagPicked}>
            {/* Untagged and concrete tags are mutually exclusive, as in classic. */}
            {check("notags", untagged, filter.noTags, () => props.onChange({ noTags: !filter.noTags, tags: filter.noTags ? filter.tags : [] }))}
            {props.tags.map((t) =>
              check(`t:${t.slug}`, t.name, filter.tags.includes(t.slug), () => props.onChange({ tags: toggle(filter.tags, t.slug), noTags: false }))
            )}
          </TagMenu>
        )}
        {props.teamView &&
          chip("pending", filter.statuses.includes("pending"), <Trans id="ui2.filter.pending">Pending</Trans>, () =>
            props.onChange({ statuses: toggle(filter.statuses, "pending") })
          )}
        {props.teamView &&
          filter.statuses.includes("private") &&
          chip("private", true, <Trans id="post.private">Private</Trans>, () => props.onChange({ statuses: toggle(filter.statuses, "private") }))}
      </div>
      <div className="u2-controls__end">
        <div className="u2-seg" role="group" aria-label={i18n._({ id: "ui2.board.layout", message: "Layout" })}>
          <button type="button" aria-pressed={!stage} onClick={() => props.onChange({ layout: "" })}>
            <Trans id="ui2.board.list">List</Trans>
          </button>
          {/* The groups are the stage filter in this view, so stage picks are cleared. */}
          <button type="button" aria-pressed={stage} onClick={() => props.onChange({ layout: "stage", statuses: pseudo })}>
            <Trans id="ui2.board.bystage">By stage</Trans>
          </button>
        </div>
        {!filter.query && (
          <div className="u2-seg" role="group" aria-label={i18n._({ id: "ui2.board.sort", message: "Sort" })}>
            {SORTS.map((s) => (
              <button key={s.value} type="button" aria-pressed={sort === s.value} onClick={() => props.onChange({ view: s.value })}>
                {i18n._({ id: s.id, message: s.message })}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
