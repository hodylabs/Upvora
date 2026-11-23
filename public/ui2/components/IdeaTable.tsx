import "./ui.css"

import React, { useEffect, useRef } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Post } from "@fider/models"
import { StatusInfo } from "../lib/status"
import { BoardInsights, momentum, rowChips } from "../lib/insights"
import { postHref } from "../lib/nav"
import { VoteButton } from "./VoteButton"
import { StatusPill } from "./StatusPill"
import { ProductChip } from "./ProductChip"
import { AvatarStack } from "./AvatarStack"
import { VoraNote } from "./VoraNote"

export interface IdeaTableProps {
  posts: Post[]
  // Staff with Team view on: voter faces, Vora's notes, Pending and Private flags, Merge.
  teamView: boolean
  focused: number
  onFocus: (index: number) => void
  statusOf: (post: Post) => StatusInfo
  statusLabel: (slug: string) => string
  onVoteChange: (number: number, voted: boolean, count: number) => void
  insights?: BoardInsights | null
  showProduct?: boolean
  newNumbers?: Set<number>
  // Where this list starts in the board's row order (By stage renders one list per group).
  offset?: number
  label?: string
}

export const IdeaTable = (props: IdeaTableProps) => {
  const bodyRef = useRef<HTMLDivElement>(null)
  const { teamView, insights } = props
  const offset = props.offset || 0

  useEffect(() => {
    const row = bodyRef.current?.querySelector<HTMLElement>(`[data-index="${props.focused}"]`)
    row?.scrollIntoView?.({ block: "nearest" })
  }, [props.focused])

  return (
    <div ref={bodyRef} className="u2-table" role="list" aria-label={props.label || i18n._({ id: "ui2.table.label", message: "Ideas" })}>
      {props.posts.map((post, i) => {
        const index = offset + i
        const status = props.statusOf(post)
        const week = momentum(insights, post.number)
        const chips = rowChips(insights, post.number, teamView).filter((c) => teamView || c.kind === "moved")
        const comments = post.commentsCount
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
            <div className="u2-tr__main">
              <span className="u2-tr__idea">
                <a className="u2-tr__title" href={postHref(post)}>
                  {post.title}
                </a>
                <span className="u2-tr__num u2-mono">#{post.number}</span>
              </span>
              <span className="u2-tr__meta">
                <StatusPill status={status} />
                {props.showProduct && post.product && <ProductChip product={post.product} />}
                <span className="u2-tr__cmts">
                  <Plural id="ui2.table.ncomments" value={comments} one="# comment" other="# comments" />
                </span>
                {!!week && week > 0 && (
                  <span className="u2-tr__week u2-mono">
                    <Trans id="ui2.table.weekgain">+{week} this week</Trans>
                  </span>
                )}
                {chips.map((chip, n) =>
                  chip.kind === "duplicate" ? (
                    <React.Fragment key={n}>
                      <span className="u2-chip u2-chip--vora">
                        {i18n._({ id: "ui2.note.duplicateof", message: "Vora: likely duplicate of #{of}", values: { of: chip.of } })}
                      </span>
                      {/* On the board this opens the idea overlay, whose merge dialog reads "#merge=N". */}
                      <a className="u2-tbtn" data-chip="duplicate" href={postHref(post, `#merge=${chip.of}`)}>
                        <Trans id="ui2.note.merge">Merge</Trans>
                      </a>
                    </React.Fragment>
                  ) : (
                    <VoraNote key={n} chip={chip} post={post} statusLabel={props.statusLabel} />
                  )
                )}
                {teamView && !post.isApproved && (
                  <span className="u2-chip u2-chip--warn" data-flag="pending">
                    <Trans id="ui2.flag.pending">Pending</Trans>
                  </span>
                )}
                {teamView && post.isPrivate && (
                  <span className="u2-chip u2-chip--warn" data-flag="private">
                    <Trans id="post.private">Private</Trans>
                  </span>
                )}
                {teamView && <AvatarStack voters={insights?.voters?.[String(post.number)]} />}
              </span>
            </div>
            <span className="u2-tr__vote">
              <VoteButton post={post} onChange={props.onVoteChange} />
            </span>
          </div>
        )
      })}
    </div>
  )
}
