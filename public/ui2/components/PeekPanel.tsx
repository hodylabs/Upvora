import "./ui.css"

import React, { useEffect, useState } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Post, Comment } from "@fider/models"
import { actions, markdown, truncate } from "@fider/services"
import { StatusInfo } from "../lib/status"
import { Voter } from "../lib/insights"
import { postHref } from "../lib/nav"
import { VoteButton } from "./VoteButton"
import { StatusPill } from "./StatusPill"
import { AvatarStack } from "./AvatarStack"

export interface PeekDetails {
  summary: string // Vora's brief as plain text, or "" when the idea has none
  latest?: Comment
  voters: Voter[]
}

// Per page load: each idea's details are fetched once.
const detailsCache = new Map<number, Promise<PeekDetails>>()

const latestComment = (list: Comment[]): Comment | undefined =>
  list.reduce<Comment | undefined>((a, c) => (!a || new Date(c.createdAt) > new Date(a.createdAt) ? c : a), undefined)

export const loadPeekDetails = (num: number, signedIn: boolean): Promise<PeekDetails> => {
  const cached = detailsCache.get(num)
  if (cached) return cached
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback)
  const p = Promise.all([
    // The brief endpoint is members only; visitors skip it (it would ask them to sign in).
    signedIn ? safe(actions.getIdeaBrief(num), { ok: false, data: { content: "", createdAt: "" } }) : Promise.resolve(null),
    safe(actions.getComments(num), { ok: false, data: [] as Comment[] }),
    safe(actions.listVotes(num), { ok: false, data: [] }),
  ]).then(([brief, comments, votes]) => ({
    // toText strips the Markdown; the result is rendered as text, never as HTML.
    summary: brief && brief.ok && brief.data?.content ? truncate(markdown.toText(brief.data.content), 320) : "",
    latest: comments.ok && Array.isArray(comments.data) ? latestComment(comments.data) : undefined,
    voters: votes.ok && Array.isArray(votes.data) ? votes.data.slice(0, 5).map((v) => ({ name: v.user.name, avatarURL: v.user.avatarURL })) : [],
  }))
  detailsCache.set(num, p)
  return p
}

interface PeekPanelProps {
  post: Post
  status: StatusInfo
  staff: boolean
  signedIn: boolean
  locale: string
  onVoteChange: (number: number, voted: boolean, count: number) => void
  onDetails?: (num: number, details: PeekDetails) => void
  onClose: () => void
}

export const PeekPanel = (props: PeekPanelProps) => {
  const { post } = props
  const [details, setDetails] = useState<PeekDetails | null>(null)

  useEffect(() => {
    let live = true
    setDetails(null)
    loadPeekDetails(post.number, props.signedIn).then((d) => {
      if (!live) return
      setDetails(d)
      props.onDetails?.(post.number, d)
    })
    return () => {
      live = false
    }
  }, [post.number])

  const votes = post.votesCount
  const comments = post.commentsCount
  const latest = details?.latest
  const ago = latest ? new Intl.DateTimeFormat(props.locale, { dateStyle: "medium" }).format(new Date(latest.createdAt)) : ""

  return (
    <aside className="u2-peek u2-panel" aria-label={i18n._({ id: "ui2.peek.label", message: "Quick peek" })} aria-live="polite">
      <div className="u2-peek__top">
        <span className="u2-mono">#{post.number}</span>
        {post.product && <span>{post.product.name}</span>}
        <button
          type="button"
          className="u2-iconbtn u2-peek__close"
          onClick={props.onClose}
          aria-label={i18n._({ id: "ui2.peek.close", message: "Close the quick peek" })}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <h2 className="u2-peek__title">{post.title}</h2>
      <div className="u2-row">
        <StatusPill status={props.status} />
        <span className="u2-muted u2-peek__meta">
          <Plural id="ui2.peek.votes" value={votes} one="# vote" other="# votes" />
          {", "}
          <Plural id="ui2.peek.comments" value={comments} one="# comment" other="# comments" />
        </span>
      </div>
      {details && details.voters.length > 0 && <AvatarStack voters={details.voters} max={5} />}
      {!details && (
        <p className="u2-muted" aria-busy="true">
          <Trans id="ui2.peek.loading">Loading…</Trans>
        </p>
      )}
      {details && details.summary && (
        <section className="u2-peek__vora">
          <h3 className="u2-peek__lbl u2-peek__lbl--vora">
            <Trans id="ui2.peek.summary">Vora&apos;s summary</Trans>
          </h3>
          <p>{details.summary}</p>
        </section>
      )}
      {details && !details.summary && post.description && (
        <section>
          <h3 className="u2-peek__lbl">
            <Trans id="ui2.peek.description">Description</Trans>
          </h3>
          <p>{truncate(markdown.toText(post.description), 280)}</p>
        </section>
      )}
      {latest && (
        <section>
          <h3 className="u2-peek__lbl">
            <Trans id="ui2.peek.latest">Latest comment</Trans>
          </h3>
          <p>
            <strong>{latest.user.name}</strong> <span className="u2-muted">{ago}</span>
            <br />
            {truncate(markdown.toText(latest.content), 220)}
          </p>
        </section>
      )}
      <div className="u2-peek__acts">
        <VoteButton post={post} onChange={props.onVoteChange} size="large" />
        <a className="u2-btn" href={postHref(post)}>
          <Trans id="ui2.peek.open">Open idea</Trans>
        </a>
      </div>
    </aside>
  )
}
