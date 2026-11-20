import "./ui.css"

import React, { useEffect, useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { actions, navigator, notify } from "@fider/services"
import { useFider } from "@fider/hooks"
import { signInHref } from "../lib/nav"

export interface Votable {
  number: number
  title: string
  votesCount: number
  hasVoted: boolean
}

interface VoteButtonProps {
  post: Votable
  // Called with the new state (optimistic first, then the server's answer or the revert).
  onChange?: (number: number, voted: boolean, count: number) => void
  size?: "row" | "large"
  children?: React.ReactNode
}

// Toggles the vote through the same action classic uses, with an optimistic count.
// The count pops (CSS keyframe) only when it changes. Signed-out people go to sign in.
export const VoteButton = (props: VoteButtonProps) => {
  const fider = useFider()
  const { post } = props
  const [voted, setVoted] = useState(post.hasVoted)
  const [count, setCount] = useState(post.votesCount)
  const [pop, setPop] = useState(false)
  const busy = useRef(false)
  const prevCount = useRef(count)

  useEffect(() => {
    setVoted(post.hasVoted)
    setCount(post.votesCount)
  }, [post.hasVoted, post.votesCount])

  useEffect(() => {
    if (prevCount.current !== count) setPop(true)
    prevCount.current = count
  }, [count])

  const apply = (v: boolean, c: number) => {
    setVoted(v)
    setCount(c)
    props.onChange?.(post.number, v, c)
  }

  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!fider.session.isAuthenticated) {
      navigator.goTo(signInHref())
      return
    }
    if (busy.current) return
    busy.current = true
    const was = { voted, count }
    apply(!was.voted, was.count + (was.voted ? -1 : 1))
    try {
      const result = await actions.toggleVote(post.number)
      if (!result.ok) {
        apply(was.voted, was.count)
        notify.error(i18n._({ id: "ui2.vote.failed", message: "Could not register your vote. Please try again." }))
      } else if (result.data && typeof result.data.voted === "boolean" && result.data.voted === was.voted) {
        // The server disagrees (e.g. a vote from another tab): keep its answer.
        apply(was.voted, was.count)
      }
    } catch {
      apply(was.voted, was.count)
    } finally {
      busy.current = false
    }
  }

  const label = voted
    ? i18n._({ id: "ui2.vote.remove", message: "Remove your vote for {title}", values: { title: post.title } })
    : i18n._({ id: "ui2.vote.add", message: "Vote for {title}", values: { title: post.title } })

  return (
    <button
      type="button"
      className={`u2-vote u2-vote--${props.size || "row"}${voted ? " is-on" : ""}`}
      aria-pressed={voted}
      aria-label={label}
      onClick={toggle}
      data-vote={post.number}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
      {props.children}
      <span className={`u2-vote__n u2-mono${pop ? " is-pop" : ""}`} onAnimationEnd={() => setPop(false)}>
        {count}
      </span>
    </button>
  )
}
