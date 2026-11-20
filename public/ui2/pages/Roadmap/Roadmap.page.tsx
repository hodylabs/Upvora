import "../../components/form/form.css"
import "./roadmap.css"

import React, { useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Post, Status, Tag } from "@fider/models"
import { actions, formatDate, markdown, notify, timeSince, truncate } from "@fider/services"
import { useFider } from "@fider/hooks"
import { VoteButton } from "../../components/VoteButton"
import { StatusPill } from "../../components/StatusPill"
import { ProductChip } from "../../components/ProductChip"
import { ProductFilter } from "../../components/ProductFilter"
import { statusInfo, statusTone } from "../../lib/status"
import { postHref } from "../../lib/nav"
import { productIdsFromURL, toggleId, writeProductIds } from "../../lib/products"
import { MoveMenu } from "./MoveMenu"
import { LANE_STEP, Lane, LaneFilter, hasMore, isCompletedLane, laneOf, lanesFrom, movePost, updatePost, visiblePosts } from "./lanes"

// Same props the server sends classic's roadmap (app/handlers/roadmap.go). Both are
// absent when the site has no roadmap (not Pro, multi-host): the page shows the upsell.
export interface RoadmapPageProps {
  columns?: { status: Status; posts: Post[] }[]
  tags?: Tag[]
}

const DRAG_TYPE = "text/plain"

interface TileProps {
  post: Post
  lane: Lane
  tags: Tag[]
  staff: boolean
  targets: { slug: string; label: string }[]
  locale: string
  showPending: boolean
  onVoteChange: (number: number, voted: boolean, count: number) => void
  onMove: (number: number, slug: string) => void
}

const Tile = (props: TileProps) => {
  const { post } = props
  const tone = statusTone(props.lane.status.slug, props.lane.status.kind)
  const completed = isCompletedLane(props.lane.status)
  const excerpt = post.description ? truncate(markdown.toText(post.description), 110) : ""
  const respondedAt = post.response?.respondedAt
  const cls = ["u2-rtile", post.hasVoted && "is-mine", tone === "shipped" && "is-shipped"].filter(Boolean).join(" ")

  return (
    <li
      className={cls}
      data-number={post.number}
      draggable={props.staff}
      onDragStart={
        props.staff
          ? (e) => {
              e.dataTransfer.setData(DRAG_TYPE, String(post.number))
              e.dataTransfer.effectAllowed = "move"
            }
          : undefined
      }
    >
      <div className="u2-rtile__vote">
        {completed && respondedAt ? (
          <span className="u2-rtile__done" title={formatDate(props.locale, respondedAt)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12l5 5L19 7" />
            </svg>
            <span className="u2-mono">{timeSince(props.locale, new Date(), new Date(respondedAt))}</span>
          </span>
        ) : (
          <VoteButton post={post} onChange={props.onVoteChange} />
        )}
      </div>
      <div className="u2-rtile__main">
        <div className="u2-rtile__line">
          <a className="u2-rtile__title" href={postHref(post)}>
            {post.title}
          </a>
          {props.showPending && !post.isApproved && (
            <span className="u2-chip u2-chip--warn">
              <Trans id="post.pending">pending</Trans>
            </span>
          )}
          {post.isPrivate && (
            <span className="u2-chip u2-chip--warn">
              <Trans id="post.private">Private</Trans>
            </span>
          )}
        </div>
        {excerpt && <p className="u2-rtile__desc">{excerpt}</p>}
        <div className="u2-rtile__meta">
          {post.product && <ProductChip product={post.product} />}
          {props.tags.map((t) => (
            <span key={t.id} className="u2-chip u2-chip--tag" style={{ "--u-chip-dot": `#${t.color}` } as React.CSSProperties}>
              {t.name}
            </span>
          ))}
          <span className="u2-rtile__cmts u2-mono">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M21 12a8 8 0 01-11.7 7.1L4 20l1-4.6A8 8 0 1121 12z" />
            </svg>
            <span className="u2-sr">
              <Trans id="ui2.table.commentcount">Comments:</Trans>
            </span>{" "}
            {post.commentsCount}
          </span>
          {props.staff && <MoveMenu title={post.title} targets={props.targets} onMove={(slug) => props.onMove(post.number, slug)} />}
        </div>
      </div>
    </li>
  )
}

const LaneColumn = (props: {
  lane: Lane
  posts: Post[]
  label: string
  collapsed: boolean
  active: boolean
  staff: boolean
  onToggle: () => void
  onDrop: (postNumber: number) => void
  onShowMore: () => void
  children: React.ReactNode
}) => {
  const [over, setOver] = useState(false)
  const { status } = props.lane
  const tone = statusTone(status.slug, status.kind)
  const bodyId = `u2-lane-${status.slug}`

  const dropProps = props.staff
    ? {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = "move"
          setOver(true)
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: React.DragEvent) => {
          e.preventDefault()
          setOver(false)
          const num = parseInt(e.dataTransfer.getData(DRAG_TYPE), 10)
          if (num) props.onDrop(num)
        },
      }
    : {}

  return (
    <section
      className={`u2-lane u2-panel u2-lane--${tone}${props.collapsed ? " is-collapsed" : ""}${props.active ? " is-active" : ""}${over ? " is-over" : ""}`}
      aria-label={props.label}
      data-lane={status.slug}
      {...dropProps}
    >
      <h2 className="u2-lane__h">
        <button type="button" className="u2-lane__toggle" aria-expanded={!props.collapsed} aria-controls={bodyId} onClick={props.onToggle}>
          <StatusPill status={{ slug: status.slug, tone, label: props.label }} />
          <span className="u2-lane__n u2-mono">{props.posts.length}</span>
          <svg className="u2-lane__chev" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </h2>
      <div id={bodyId} className="u2-lane__body" hidden={props.collapsed}>
        {props.posts.length > 0 ? (
          <ul className="u2-lane__list">{props.children}</ul>
        ) : (
          <p className="u2-lane__empty u2-muted">
            <Trans id="ui2.roadmap.lane.empty">Nothing here yet.</Trans>
          </p>
        )}
        {hasMore(props.lane) && (
          <button type="button" className="u2-lane__more" onClick={props.onShowMore}>
            <Trans id="roadmap.column.showmore">Show more</Trans>
          </button>
        )}
      </div>
    </section>
  )
}

const Backdrop = () => (
  <div className="u2-roadmap__ghost" aria-hidden="true">
    {[0, 1, 2].map((i) => (
      <div key={i} className="u2-panel">
        <i />
        <i />
      </div>
    ))}
  </div>
)

const Upsell = () => {
  const fider = useFider()
  const showBilling = fider.session.isAuthenticated && fider.session.user.isAdministrator && fider.settings.isBillingEnabled
  return (
    <div className="u2-roadmap__blank">
      <Backdrop />
      <h1>
        <Trans id="roadmap.upsell.title">See what&apos;s happening in the Roadmap view</Trans>
      </h1>
      <p className="u2-muted">
        <Trans id="roadmap.upsell.description">Upgrade to Pro to unlock your Roadmap</Trans>
      </p>
      {showBilling && (
        <a className="u2-btn u2-btn--primary" href="/admin/billing">
          <Trans id="roadmap.upsell.billing">Upgrade to PRO</Trans>
        </a>
      )}
    </div>
  )
}

const Blank = () => (
  <div className="u2-roadmap__blank">
    <Backdrop />
    <h1>
      <Trans id="roadmap.blank.title">Your roadmap is waiting for its first update</Trans>
    </h1>
    <p className="u2-muted">
      <Trans id="roadmap.blank.description">Mark posts as planned or in progress and they&apos;ll show up here on the roadmap.</Trans>
    </p>
  </div>
)

export const RoadmapBoard = (props: RoadmapPageProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const products = tenant.products || []
  const tags = props.tags || []
  const staff = fider.session.isAuthenticated && fider.session.user.isCollaborator

  const [lanes, setLanes] = useState<Lane[]>(() => lanesFrom(props.columns))
  const [filter, setFilter] = useState<LaneFilter>(() => ({ products: productIdsFromURL(products, location.search), tag: null, query: "" }))
  const [collapsed, setCollapsed] = useState<{ [slug: string]: boolean }>({})
  const [activeLane, setActiveLane] = useState(() => lanes[0]?.status.slug || "")
  const [announce, setAnnounce] = useState("")
  const lanesRef = useRef(lanes)
  lanesRef.current = lanes

  const labelOf = (s: Status) => statusInfo(tenant, s.slug, s.kind).label || s.label

  // Reload every lane at its current size, e.g. after a move (the server's order wins).
  const reload = async () => {
    const next = await Promise.all(
      lanesRef.current.map(async (lane) => {
        const res = await actions.searchPosts({ statuses: [lane.status.slug], limit: lane.limit })
        return res.ok ? { ...lane, posts: res.data } : lane
      })
    )
    setLanes(next)
  }

  const showMore = async (slug: string) => {
    const lane = lanesRef.current.find((l) => l.status.slug === slug)
    if (!lane) return
    const limit = lane.limit + LANE_STEP
    const res = await actions.searchPosts({ statuses: [slug], limit })
    if (!res.ok) return
    setLanes((ls) => ls.map((l) => (l.status.slug === slug ? { ...l, posts: res.data, limit } : l)))
  }

  // Staff move an idea through the same respond API classic's drag uses, keeping
  // the idea's current response text. Optimistic; reverts on failure.
  const move = async (postNumber: number, toSlug: string) => {
    const from = laneOf(lanesRef.current, postNumber)
    const to = lanesRef.current.find((l) => l.status.slug === toSlug)
    if (!staff || !from || !to || from.status.slug === toSlug) return
    const post = from.posts.find((p) => p.number === postNumber) as Post
    setLanes((ls) => movePost(ls, postNumber, toSlug))
    const res = await actions.respond(postNumber, { status: toSlug, text: post.response?.text || "", originalNumber: 0 })
    if (!res.ok) {
      setLanes((ls) => movePost(ls, postNumber, from.status.slug))
      notify.error(i18n._({ id: "ui2.roadmap.move.failed", message: "Could not change the status. Please try again." }))
      return
    }
    setAnnounce(i18n._({ id: "ui2.roadmap.moved", message: "Moved {title} to {lane}", values: { title: post.title, lane: labelOf(to.status) } }))
    window.setTimeout(() => document.querySelector<HTMLElement>(`.u2-rtile[data-number="${postNumber}"] .u2-rtile__title`)?.focus(), 0)
    void reload()
  }

  const onVoteChange = (num: number, voted: boolean, count: number) => setLanes((ls) => updatePost(ls, num, { hasVoted: voted, votesCount: count }))

  const toggleProduct = (id: number) => {
    const next = toggleId(filter.products, id)
    setFilter({ ...filter, products: next })
    writeProductIds(products, next)
  }

  if (!lanes.some((l) => l.posts.length > 0)) return <Blank />

  return (
    <div className="u2-roadmap">
      <header className="u2-roadmap__head">
        <h1>
          <Trans id="roadmap.head.title">Where things stand</Trans>
        </h1>
        <p className="u2-muted">
          <Trans id="roadmap.head.subtitle">From triage to shipped. Every card started as a vote on the board.</Trans>
        </p>
      </header>

      <div className="u2-roadmap__tools">
        <ProductFilter products={products} selected={filter.products} onToggle={toggleProduct} />
        <input
          type="search"
          className="u2-ctl u2-roadmap__search"
          placeholder={i18n._({ id: "ui2.roadmap.search", message: "Search the roadmap" })}
          aria-label={i18n._({ id: "ui2.roadmap.search", message: "Search the roadmap" })}
          value={filter.query}
          onChange={(e) => setFilter({ ...filter, query: e.target.value })}
        />
        {tags.length > 0 && (
          <div className="u2-roadmap__tags" role="group" aria-label={i18n._({ id: "ui2.roadmap.tags", message: "Filter by tag" })}>
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                className="u2-chip u2-chip--tag u2-pfilter__chip"
                aria-pressed={filter.tag === t.slug}
                style={{ "--u-chip-dot": `#${t.color}` } as React.CSSProperties}
                onClick={() => setFilter({ ...filter, tag: filter.tag === t.slug ? null : t.slug })}
              >
                {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Phones show one lane at a time. */}
      <div className="u2-roadmap__tabs" role="group" aria-label={i18n._({ id: "ui2.roadmap.lanes", message: "Lanes" })}>
        {lanes.map((l) => (
          <button
            key={l.status.slug}
            type="button"
            className="u2-rtab"
            aria-pressed={activeLane === l.status.slug}
            onClick={() => setActiveLane(l.status.slug)}
          >
            {labelOf(l.status)} <span className="u2-mono u2-muted">{visiblePosts(l, filter).length}</span>
          </button>
        ))}
      </div>

      <div className="u2-roadmap__lanes">
        {lanes.map((lane) => {
          const posts = visiblePosts(lane, filter)
          const targets = lanes.filter((l) => l !== lane).map((l) => ({ slug: l.status.slug, label: labelOf(l.status) }))
          const slug = lane.status.slug
          return (
            <LaneColumn
              key={slug}
              lane={lane}
              posts={posts}
              label={labelOf(lane.status)}
              collapsed={!!collapsed[slug]}
              active={activeLane === slug}
              staff={staff}
              onToggle={() => setCollapsed((c) => ({ ...c, [slug]: !c[slug] }))}
              onDrop={(num) => move(num, slug)}
              onShowMore={() => showMore(slug)}
            >
              {posts.map((post) => (
                <Tile
                  key={post.id}
                  post={post}
                  lane={lane}
                  tags={tags.filter((t) => post.tags.includes(t.slug))}
                  staff={staff}
                  targets={targets}
                  locale={fider.currentLocale}
                  showPending={tenant.isModerationEnabled}
                  onVoteChange={onVoteChange}
                  onMove={move}
                />
              ))}
            </LaneColumn>
          )
        })}
      </div>
      <p className="u2-sr" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  )
}

const RoadmapPage = (props: RoadmapPageProps) => {
  const fider = useFider()
  const hasRoadmap = fider.isSingleHostMode() || fider.session.tenant.isPro
  return hasRoadmap ? <RoadmapBoard {...props} /> : <Upsell />
}

export default RoadmapPage
