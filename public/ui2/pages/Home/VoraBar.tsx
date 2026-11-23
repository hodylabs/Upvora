import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Post } from "@fider/models"
import { actions } from "@fider/services"
import { useFider } from "@fider/hooks"
import { VoteButton } from "../../components/VoteButton"
import { postHref } from "../../lib/nav"

interface VoraBarProps {
  query: string
  onQueryChange: (query: string) => void
  noiseWords: string[]
  shareLabel: string
  canShare: boolean
  onShare: (title: string) => void
  onVoteChange: (number: number, voted: boolean, count: number) => void
  // The board's rows: a suggestion that is also on the board shows the board's vote state.
  boardPosts?: Post[]
  // Shown next to the Share button (the admins' "Add a message").
  extra?: React.ReactNode
}

const SUGGEST_DELAY = 400
const MAX_SUGGESTIONS = 5

// Search terms without the noise words, as classic's similar-ideas lookup does.
export const similarQuery = (text: string, noise: string[]): string =>
  text
    .split(/\s+/)
    .filter((w) => w && !noise.includes(w.toLowerCase()))
    .join(" ")

export const modKey = () => (/Mac|iPhone|iPad/.test(window.navigator.platform) ? "⌘K" : "Ctrl K")

// The share side of the welcome card: the input searches the board (the `query` param)
// and shows similar ideas while typing; Share opens the share flow. Cmd/Ctrl+K focuses it.
export const VoraBar = (props: VoraBarProps) => {
  const fider = useFider()
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [suggestions, setSuggestions] = useState<Post[]>([])
  const [open, setOpen] = useState(false)
  const seq = useRef(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDoc)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDoc)
    }
  }, [])

  useEffect(() => {
    const q = similarQuery(props.query.trim(), props.noiseWords)
    const id = ++seq.current
    // Old suggestions never sit under a new query, even if the next lookup fails.
    setSuggestions([])
    if (q.length < 2) {
      return
    }
    const timer = window.setTimeout(() => {
      actions
        .findSimilarPosts(q)
        .then((res) => {
          if (id === seq.current) setSuggestions(res.ok ? (res.data || []).slice(0, MAX_SUGGESTIONS) : [])
        })
        .catch(() => undefined)
    }, SUGGEST_DELAY)
    return () => window.clearTimeout(timer)
  }, [props.query])

  const onVote = (num: number, voted: boolean, count: number) => {
    setSuggestions((list) => list.map((p) => (p.number === num ? { ...p, hasVoted: voted, votesCount: count } : p)))
    props.onVoteChange(num, voted, count)
  }

  const showList = open && suggestions.length > 0
  const placeholder = fider.session.tenant.invitation || i18n._({ id: "ui2.vora.placeholder", message: "Search, or tell Vora what you need" })

  return (
    <div className="u2-vora" ref={boxRef}>
      <h2 className="u2-vora__h">
        <span className="u2-vora__logo" aria-hidden="true" />
        {props.shareLabel}
      </h2>
      <label htmlFor="u2-vora-input" className="u2-sr">
        <Trans id="ui2.vora.label">Search ideas, or share a new one</Trans>
      </label>
      <input
        id="u2-vora-input"
        ref={inputRef}
        className="u2-vora__input"
        type="search"
        autoComplete="off"
        value={props.query}
        placeholder={placeholder}
        aria-controls={showList ? "u2-vora-list" : undefined}
        aria-expanded={showList}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          props.onQueryChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (showList) setOpen(false)
            else inputRef.current?.blur()
          }
        }}
      />
      <div className="u2-vora__foot">
        <small className="u2-vora__hint">
          <Trans id="ui2.vora.hint">Similar ideas show up as you type</Trans>
        </small>
        {props.extra}
        {props.canShare && (
          <button type="button" className="u2-btn u2-btn--primary u2-vora__share" onClick={() => props.onShare(props.query.trim())}>
            <Trans id="ui2.vora.go">Share</Trans>
          </button>
        )}
      </div>
      {showList && (
        <div className="u2-vora__pop u2-panel" id="u2-vora-list">
          <p className="u2-vora__poph">
            <Trans id="ui2.vora.similar">Vora found ideas like this</Trans>
          </p>
          <ul className="u2-vora__list">
            {suggestions
              .map((s) => {
                const onBoard = props.boardPosts?.find((b) => b.number === s.number)
                return onBoard ? { ...s, hasVoted: onBoard.hasVoted, votesCount: onBoard.votesCount } : s
              })
              .map((p) => (
                <li key={p.id}>
                  <VoteButton post={p} onChange={onVote} />
                  <a href={postHref(p)}>{p.title}</a>
                </li>
              ))}
          </ul>
          {props.canShare && (
            <div className="u2-vora__popfoot">
              <span>
                <Trans id="ui2.vora.notquite">Not quite? Vora can turn it into a new idea in a few questions.</Trans>
              </span>
              <button type="button" className="u2-btn u2-btn--primary" onClick={() => props.onShare(props.query.trim())}>
                <Trans id="ui2.vora.start">Start with Vora</Trans>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
