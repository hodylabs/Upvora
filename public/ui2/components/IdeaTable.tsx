import "./ui.css"

import React, { useEffect, useRef } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Post, Tag } from "@fider/models"
import { StatusInfo } from "../lib/status"
import { BoardInsights, Voter, momentum, rowChips } from "../lib/insights"
import { postHref } from "../lib/nav"
import { VoteButton } from "./VoteButton"
import { StatusPill } from "./StatusPill"
import { ProductChip } from "./ProductChip"
import { AvatarStack } from "./AvatarStack"
import { VoraNote } from "./VoraNote"

export interface IdeaTableProps {
  posts: Post[]
  // Staff (collaborators and admins) also see voter faces.
  staff: boolean
  focused: number
  onFocus: (index: number) => void
  statusOf: (post: Post) => StatusInfo
  statusLabel: (slug: string) => string
  onVoteChange: (number: number, voted: boolean, count: number) => void
  insights?: BoardInsights | null
  voters?: { [num: number]: Voter[] }
  tags?: Tag[]
  showProduct?: boolean
  showPending?: boolean
  newNumbers?: Set<number>
  // Where this list starts in the board's row order (By stage renders one list per group).
  offset?: number
  // The top vote count on the page; the heat bar is relative to it.
  maxVotes?: number
  label?: string
}

const MAX_TAGS = 2

export const IdeaTable = (props: IdeaTableProps) => {
  const bodyRef = useRef<HTMLDivElement>(null)
  const { staff, insights } = props
  const offset = props.offset || 0
  const max = Math.max(1, props.maxVotes || 0, ...props.posts.map((p) => p.votesCount))

  useEffect(() => {
    const row = bodyRef.current?.querySelector<HTMLElement>(`[data-index="${props.focused}"]`)
    row?.scrollIntoView?.({ block: "nearest" })
  }, [props.focused])

  const tagsOf = (post: Post) => (props.tags || []).filter((t) => post.tags.includes(t.slug))

  return (
    <div ref={bodyRef} className="u2-table" role="list" aria-label={props.label || i18n._({ id: "ui2.table.label", message: "Ideas" })}>
      {props.posts.map((post, i) => {
        const index = offset + i
        const status = props.statusOf(post)
        const week = momentum(insights, post.number)
        const tags = tagsOf(post)
        const cls = [
          "u2-tr",
          post.hasVoted && "is-mine",
          status.tone === "shipped" && "is-shipped",
          index === props.focused && "is-focused",
          props.newNumbers?.has(post.number) && "is-new",
        ]
          .filter(Boolean)
          .join(" ")
        return (
          <div
            key={post.id}
            className={cls}
            role="listitem"
            data-index={index}
            data-number={post.number}
            aria-current={index === props.focused ? "true" : undefined}
            // Links and buttons in the row (title, vote, notes) do their own thing.
            onClick={(e) => !(e.target as HTMLElement).closest("a, button") && props.onFocus(index)}
          >
            <span className="u2-tr__idea">
              <a className="u2-tr__title" href={postHref(post)}>
                {post.title}
              </a>
              <span className="u2-tr__num u2-mono">#{post.number}</span>
            </span>
            <span className="u2-tr__meta">
              {!!week && week > 0 && (
                <span className="u2-tr__week u2-mono">
                  <Trans id="ui2.table.weekgain">+{week} this week</Trans>
                </span>
              )}
              <StatusPill status={status} />
              {props.showProduct && post.product && <ProductChip product={post.product} />}
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
              {tags.slice(0, MAX_TAGS).map((t) => (
                <span key={t.id} className="u2-chip u2-chip--tag" style={{ "--u-chip-dot": `#${t.color}` } as React.CSSProperties}>
                  {t.name}
                </span>
              ))}
              {tags.length > MAX_TAGS && <span className="u2-chip u2-chip--tag">+{tags.length - MAX_TAGS}</span>}
              {rowChips(insights, post.number, staff).map((chip, n) => (
                <VoraNote key={n} chip={chip} post={post} statusLabel={props.statusLabel} />
              ))}
              {staff && <AvatarStack voters={insights?.voters?.[String(post.number)] || props.voters?.[post.number]} />}
            </span>
            <span className="u2-tr__heat">
              <span className="u2-heat" aria-hidden="true">
                <i style={{ inlineSize: `${Math.round((post.votesCount / max) * 100)}%` }} />
              </span>
              <span className="u2-tr__cmts u2-mono">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M21 12a8 8 0 01-11.7 7.1L4 20l1-4.6A8 8 0 1121 12z" />
                </svg>
                <span className="u2-sr">
                  <Trans id="ui2.table.commentcount">Comments:</Trans>
                </span>{" "}
                {post.commentsCount}
              </span>
            </span>
            <span className="u2-tr__vote">
              <VoteButton post={post} onChange={props.onVoteChange} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
