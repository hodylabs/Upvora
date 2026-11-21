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
  // Staff (collaborators and admins) get the full density.
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
}

const MAX_TAGS = 2

export const IdeaTable = (props: IdeaTableProps) => {
  const bodyRef = useRef<HTMLDivElement>(null)
  const { staff, insights } = props

  useEffect(() => {
    const row = bodyRef.current?.querySelector<HTMLElement>(`[data-index="${props.focused}"]`)
    row?.scrollIntoView?.({ block: "nearest" })
  }, [props.focused])

  const tagsOf = (post: Post) => (props.tags || []).filter((t) => post.tags.includes(t.slug))

  return (
    <div className={`u2-table${staff ? " u2-table--staff" : ""}`} role="table" aria-label={i18n._({ id: "ui2.table.label", message: "Ideas" })}>
      <div className="u2-table__head" role="row">
        <span role="columnheader">
          <Trans id="ui2.table.votes">Votes</Trans>
        </span>
        {staff && (
          <span role="columnheader" className="u2-table__num">
            <span className="u2-sr">
              <Trans id="ui2.table.number">Number</Trans>
            </span>
          </span>
        )}
        <span role="columnheader">
          <Trans id="ui2.table.idea">Idea</Trans>
        </span>
        {staff && (
          <span role="columnheader">
            <Trans id="ui2.table.week">This week</Trans>
          </span>
        )}
        <span role="columnheader">
          <Trans id="ui2.table.status">Status</Trans>
        </span>
        {staff && (
          <span role="columnheader">
            <Trans id="ui2.table.voters">Voters</Trans>
          </span>
        )}
        {staff && (
          <span role="columnheader">
            <span className="u2-sr">
              <Trans id="ui2.table.comments">Comments</Trans>
            </span>
          </span>
        )}
      </div>
      <div ref={bodyRef} role="rowgroup">
        {props.posts.map((post, index) => {
          const status = props.statusOf(post)
          const week = staff ? momentum(insights, post.number) : null
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
              role="row"
              data-index={index}
              data-number={post.number}
              aria-current={index === props.focused ? "true" : undefined}
              onClick={() => props.onFocus(index)}
            >
              <span role="cell" className="u2-tr__vote">
                <VoteButton post={post} onChange={props.onVoteChange} />
              </span>
              {staff && (
                <span role="cell" className="u2-tr__num u2-mono">
                  #{post.number}
                </span>
              )}
              <span role="cell" className="u2-tr__idea">
                <a className="u2-tr__title" href={postHref(post)}>
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
                {props.showProduct && post.product && <ProductChip product={post.product} />}
                {tags.slice(0, MAX_TAGS).map((t) => (
                  <span key={t.id} className="u2-chip u2-chip--tag" style={{ "--u-chip-dot": `#${t.color}` } as React.CSSProperties}>
                    {t.name}
                  </span>
                ))}
                {tags.length > MAX_TAGS && <span className="u2-chip u2-chip--tag">+{tags.length - MAX_TAGS}</span>}
                {rowChips(insights, post.number, staff).map((chip, i) => (
                  <VoraNote key={i} chip={chip} post={post} statusLabel={props.statusLabel} />
                ))}
              </span>
              {staff && (
                <span role="cell" className={`u2-tr__week u2-mono${week ? " is-up" : ""}`}>
                  {week === null ? "" : week > 0 ? `+${week}` : <Trans id="ui2.table.quiet">quiet</Trans>}
                </span>
              )}
              <span role="cell" className="u2-tr__status">
                <StatusPill status={status} />
              </span>
              {staff && (
                <span role="cell" className="u2-tr__faces">
                  <AvatarStack voters={insights?.voters?.[String(post.number)] || props.voters?.[post.number]} />
                </span>
              )}
              {staff && (
                <span role="cell" className="u2-tr__cmts u2-mono">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M21 12a8 8 0 01-11.7 7.1L4 20l1-4.6A8 8 0 1121 12z" />
                  </svg>
                  <span className="u2-sr">
                    <Trans id="ui2.table.commentcount">Comments:</Trans>
                  </span>{" "}
                  {post.commentsCount}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
