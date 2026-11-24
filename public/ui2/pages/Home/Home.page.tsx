import "./home.css"

import React, { Suspense, lazy, useEffect, useRef, useState } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { AIMessage, Post, Tag, Product, PostStatus, statusListFor } from "@fider/models"
import { actions, cache, markdown, navigator } from "@fider/services"
import { useFider, usePostOverlay } from "@fider/hooks"
import { IdeaTable, IdeaTableProps } from "../../components/IdeaTable"
import { StatusPill } from "../../components/StatusPill"
import { VoteButton } from "../../components/VoteButton"
import { isTypingTarget, useRowKeys } from "../../components/useRowKeys"
import { VoraChat } from "../../components/share/VoraChat"
import { DRAFT_KEYS, shareSignInHref, titleLongEnough, voraGate } from "../../components/share/rules"
import { statusInfo } from "../../lib/status"
import { BoardInsights, duplicateOf, fetchInsights } from "../../lib/insights"
import { postHref, replaceQuery } from "../../lib/nav"
import { BoardControls } from "./BoardControls"
import { Briefing } from "./Briefing"
import { Hero } from "./Hero"
import { useTeamView } from "../../lib/teamView"
import { BoardFilter, DEFAULT_LIMIT, filterFromURL, filterToQuery, searchParams } from "./filter"

// Same props the server sends classic's Home page (app/handlers/post.go, renderBoard).
export interface HomePageProps {
  posts: Post[]
  tags: Tag[]
  searchNoiseWords: string[]
  countPerStatus: { [key: string]: number }
  product?: Product
  countPerProduct?: { [id: string]: number }
}

// The idea overlay loads on first open, so the board does not carry the idea page's code.
const IdeaOverlay = lazy(() => import(/* webpackChunkName: "idea" */ "../ShowPost/IdeaOverlay"))

const SEARCH_DELAY = 300
const MATCH_DELAY = 400
// Where admins set the welcome message (Administration, General).
export const WELCOME_SETTING = "/admin#welcome-message"

// The welcome header marks emphasis with _underscores_, as in classic.
const welcomeHeader = (text: string): React.ReactNode[] =>
  text.split(/_([^_]+)_/g).map((part, i) =>
    i % 2 === 1 ? (
      <em key={i} className="u2-hero__em">
        {part}
      </em>
    ) : (
      part
    )
  )

const isLonely = (countPerStatus: { [key: string]: number }) => {
  const keys = Object.keys(countPerStatus)
  return keys.length === 0 || (keys.length === 1 && PostStatus.Deleted.value in countPerStatus)
}

// Search terms without the noise words, as classic's similar-ideas lookup does.
export const similarQuery = (text: string, noise: string[]): string =>
  text
    .split(/\s+/)
    .filter((w) => w && !noise.includes(w.toLowerCase()))
    .join(" ")

// shortcut: "strong" = the top similar idea's title holds at least half the typed words; upgrade when the API returns a score.
export const strongMatch = (query: string, title: string): boolean => {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2)
  if (words.length === 0) return false
  const t = title.toLowerCase()
  return words.filter((w) => t.includes(w)).length * 2 >= words.length
}

// What Vora drafted at the end of the inline conversation, posted as the dialog does.
interface VoraDraft {
  title: string
  description: string
  brief: string
  transcript: AIMessage[]
  voraToken: string
}

const HomePage = (props: HomePageProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const signedIn = fider.session.isAuthenticated
  const user = signedIn ? fider.session.user : undefined
  const staff = !!user?.isCollaborator
  const [teamViewOn] = useTeamView()
  const teamView = staff && teamViewOn
  const canShare = !fider.isReadOnly
  const products = tenant.products ?? []
  // On the all-products board the share card picks the product (first one by default, as the dialog).
  const [chosenProduct, setChosenProduct] = useState(products[0]?.id ?? 0)
  const productId = props.product?.id ?? chosenProduct
  const gate = voraGate(tenant, user, productId)

  const [filter, setFilter] = useState<BoardFilter>(filterFromURL)
  const [posts, setPosts] = useState<Post[]>(props.posts || [])
  const [loading, setLoading] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [newNumbers, setNewNumbers] = useState<Set<number>>(new Set())
  const [insights, setInsights] = useState<BoardInsights | null>(null)
  const [focused, setFocused] = useState(-1)
  // The idea just shared stays on top until the next filter change.
  const [pinned, setPinned] = useState<Post | null>(null)
  const [details, setDetails] = useState("")
  const [posting, setPosting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [shared, setShared] = useState<"" | "live" | "pending">("")
  const [match, setMatch] = useState<Post | null>(null)
  const [chat, setChat] = useState<{ messages: AIMessage[]; input: string } | null>(null)
  const [draft, setDraft] = useState<VoraDraft | null>(null)
  const [chatKey, setChatKey] = useState(0)
  const [isPrivate, setIsPrivate] = useState(false)
  // Classic's rule for the "Make private" choice.
  const canMakePrivate = staff || (signedIn && !!tenant.membersPrivateIdeas)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const matchSeq = useRef(0)
  const searchTimer = useRef<number>()

  // Opening an idea shows it over the board and pushes its URL, as classic's overlay does;
  // Esc, the close button or Back return to the board URL.
  const { selectedPostId, handlePostClick, handleCloseOverlay, setIsPostDirty } = usePostOverlay({
    basePath: props.product ? `/p/${props.product.slug}` : "/",
    onPostClosed: (num) =>
      actions.getPost(num).then((r) => {
        if (!r.ok || !r.data) return
        setPosts((list) => list.map((p) => (p.number === num ? r.data : p)))
        setPinned((p) => (p && p.number === num ? r.data : p))
        setMatch((p) => (p && p.number === num ? r.data : p))
      }),
  })
  const overlayOpen = useRef(false)
  overlayOpen.current = selectedPostId !== null
  const openIdea = (href: string) => {
    const m = /^\/posts\/(\d+)\/([^/?#]*)(#.*)?$/.exec(href)
    if (!m) return false
    handlePostClick(parseInt(m[1], 10), m[2])
    // "#merge=N" and "#comment" ride along for the idea view to act on.
    if (m[3]) history.replaceState(history.state, "", `/posts/${m[1]}/${m[2]}${m[3]}`)
    return true
  }
  // Idea links on the board (titles, Vora notes, the match note) open the overlay;
  // modified clicks (new tab, new window) keep the browser's default.
  const onBoardClick = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as HTMLElement).closest?.("a[href^='/posts/']")
    if (a && openIdea(a.getAttribute("href") || "")) e.preventDefault()
  }

  const statusOf = (p: Post) => statusInfo(tenant, p.status, p.statusKind)
  const statusLabel = (slug: string) => statusInfo(tenant, slug).label
  // Every status the site has, in its order; By stage shows one group each.
  const statusList = statusListFor(tenant).filter((s) => s.value !== "deleted")
  const stage = filter.layout === "stage"
  // Shipped and closed kinds start folded.
  const [folded, setFolded] = useState<Set<string>>(() => new Set(statusList.filter((s) => s.closed).map((s) => s.value)))
  const toggleGroup = (slug: string) => {
    setFolded((f) => {
      const next = new Set(f)
      if (!next.delete(slug)) next.add(slug)
      return next
    })
    setFocused(-1)
  }

  // Refresh the list through the same search API classic uses; stale answers are dropped.
  const update = (patch: Partial<BoardFilter>, reset = true) => {
    const next = { ...filter, ...patch }
    setFilter(next)
    setPinned(null)
    replaceQuery(filterToQuery(next))
    setLoading(true)
    const id = ++seq.current
    const before = new Set(posts.map((p) => p.number))
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(
      () => {
        actions
          // By stage asks for every status; the default list leaves closed kinds out.
          .searchPosts(
            searchParams(
              next.layout === "stage"
                ? { ...next, statuses: [...statusList.map((s) => s.value), ...next.statuses.filter((s) => s === "pending" || s === "private")] }
                : next,
              props.product?.id
            )
          )
          .then((res) => {
            if (id !== seq.current) return
            setLoading(false)
            if (!res.ok) {
              setSearchFailed(true)
              return
            }
            setSearchFailed(false)
            const list = res.data || []
            setPosts(list)
            setNewNumbers(reset ? new Set() : new Set(list.filter((p) => !before.has(p.number)).map((p) => p.number)))
            // In By stage, loaded ideas land inside groups and shift the row order.
            if (reset || next.layout === "stage") setFocused(-1)
          })
          .catch(() => {
            if (id !== seq.current) return
            setLoading(false)
            setSearchFailed(true)
          })
      },
      "query" in patch ? SEARCH_DELAY : 0
    )
  }

  useEffect(() => {
    // The server renders the default list; By stage needs closed kinds too.
    if (filter.layout === "stage") update({})
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || overlayOpen.current || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(searchTimer.current)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  const query = filter.query.trim()

  // Vora's match note: the top similar idea, when it is a strong match. Stale answers are dropped.
  useEffect(() => {
    const id = ++matchSeq.current
    setMatch(null)
    const q = similarQuery(query, props.searchNoiseWords || [])
    if (!gate.available || q.length < 2) return
    const timer = window.setTimeout(() => {
      actions
        .findSimilarPosts(q)
        .then((res) => {
          const top = res.ok ? (res.data || [])[0] : undefined
          if (id === matchSeq.current && top && strongMatch(q, top.title)) setMatch(top)
        })
        .catch(() => undefined)
    }, MATCH_DELAY)
    return () => window.clearTimeout(timer)
  }, [query, gate.available])

  const shown = pinned ? [pinned, ...posts.filter((p) => p.number !== pinned.number)] : posts

  // Insights for the visible rows; any failure hides the features that need them.
  const numbersKey = shown.map((p) => p.number).join(",")
  useEffect(() => {
    let live = true
    fetchInsights(shown.map((p) => p.number)).then((data) => live && setInsights(data))
    return () => {
      live = false
    }
  }, [numbersKey])

  const onVoteChange = (num: number, voted: boolean, count: number) => {
    const set = (p: Post) => (p.number === num ? { ...p, hasVoted: voted, votesCount: count } : p)
    setPosts((list) => list.map(set))
    setPinned((p) => p && set(p))
    setMatch((p) => p && set(p))
  }

  const changeQuery = (q: string) => {
    setErrors([])
    setShared("")
    // Details belong to the typed idea; an emptied box starts a new one.
    if (!q.trim()) setDetails("")
    update({ query: q })
  }

  // Signed-out people sign in first and come back with ?share=1, which reopens the
  // share dialog with what they typed (classic's draft keys).
  const toSignIn = (title: string, description = "") => {
    cache.local.set(DRAFT_KEYS.TITLE, title)
    if (description.trim()) cache.local.set(DRAFT_KEYS.DESCRIPTION, description)
    navigator.goTo(shareSignInHref())
  }

  const openChat = (title: string, description = "") => {
    const text = description.trim() ? `${title}\n\n${description.trim()}` : title
    if (!signedIn) return toSignIn(title, description)
    setErrors([])
    setShared("")
    setDraft(null)
    setChat({ messages: [], input: text })
    // A new key remounts VoraChat, so a reply still pending from the last conversation is dropped.
    setChatKey((k) => k + 1)
  }

  const post = async (title: string, description: string, vora?: VoraDraft) => {
    setPosting(true)
    setErrors([])
    const failed = i18n._({ id: "ui2.share.failed", message: "Your idea could not be shared. Try again." })
    let number = 0
    // A filter changed while the idea posted wins over the reset below.
    const before = seq.current
    try {
      const res = await actions.createPost(title, description, [], [], productId, vora?.brief || "", vora?.transcript || [], isPrivate, vora?.voraToken || "")
      if (!res.ok) {
        const messages = (res.error?.errors || []).map((e) => e.message).filter(Boolean)
        setErrors(messages.length ? messages : [failed])
        return
      }
      number = res.data.number
      setShared(res.data.isApproved ? "live" : "pending")
      setDetails("")
      setIsPrivate(false)
      setDraft(null)
      setChat(null)
      if (seq.current !== before) return
      update({ query: "" })
    } catch {
      setErrors([failed])
      return
    } finally {
      setPosting(false)
    }
    // The idea exists now; a failed read only means it is not pinned on top.
    const gen = seq.current
    const full = await actions.getPost(number).catch(() => null)
    if (full?.ok && full.data && gen === seq.current) {
      setPinned(full.data)
      setNewNumbers(new Set([full.data.number]))
    }
  }

  // Share and Enter post what was typed, under every rule the share dialog follows;
  // the server checks them all again on create.
  const share = (text: string, description = "") => {
    const title = text.trim()
    if (!canShare || posting) return
    // A Vora draft on screen is what Share means now.
    if (draft) return post(draft.title, draft.description, draft)
    if (!title) {
      inputRef.current?.focus()
      return
    }
    if (!signedIn) return toSignIn(title, description)
    if (gate.required) return openChat(title, description)
    if (!titleLongEnough(title)) {
      setErrors([i18n._({ id: "ui2.share.tooshort", message: "Add a few more words: a title needs at least 10 characters." })])
      return
    }
    post(title, description)
  }

  // By stage: groups for the site's statuses, plus any status a loaded idea has that the list lacks.
  const groupSlugs = [
    ...statusList.map((s) => s.value),
    ...shown.map((p) => p.status).filter((v, i, a) => a.indexOf(v) === i && !statusList.some((s) => s.value === v)),
  ]
  const groups = stage ? groupSlugs.map((slug) => ({ slug, posts: shown.filter((p) => p.status === slug) })) : []
  // Keyboard order follows what is on screen: folded groups are skipped.
  const rows = stage ? groups.flatMap((g) => (folded.has(g.slug) ? [] : g.posts)) : shown

  // A click or tap anywhere on a row opens the idea.
  const openRow = (i: number) => {
    setFocused(i)
    openIdea(postHref(rows[i]))
  }

  useRowKeys({
    // The overlay owns the keyboard while it is open.
    count: selectedPostId === null ? rows.length : 0,
    focused,
    setFocused,
    onVote: (i) => document.querySelector<HTMLButtonElement>(`.u2-tr[data-index="${i}"] .u2-vote`)?.click(),
    onOpen: (i) => openIdea(postHref(rows[i])),
    // Merge into Vora's likely original when it has one, else the merge dialog opens empty.
    onMerge: staff
      ? (i) => {
          const of = duplicateOf(insights, rows[i].number)
          openIdea(postHref(rows[i], of ? `#merge=${of}` : "#merge"))
        }
      : undefined,
    onEscape: () => setFocused(-1),
  })

  const lonely = isLonely(props.countPerStatus)
  const limit = filter.limit || DEFAULT_LIMIT
  const canLoadMore = posts.length >= limit
  const moreHref = location.pathname + filterToQuery({ ...filter, limit: limit + 10 })
  const productName = props.product?.name
  const heading = tenant.welcomeHeader ? (
    welcomeHeader(tenant.welcomeHeader)
  ) : props.product ? (
    <Trans id="ui2.home.producttitle">What should we build next for {productName}?</Trans>
  ) : (
    <Trans id="ui2.hero.title">What should we build next?</Trans>
  )
  // Not tied to loading, so the card (and its details) stays put while a retyped title searches.
  const noMatch = canShare && !!query && !searchFailed && shown.length === 0 && !chat && !draft
  const tableProps: Omit<IdeaTableProps, "posts"> = {
    teamView,
    focused,
    onFocus: openRow,
    statusOf,
    statusLabel,
    onVoteChange,
    insights,
    showProduct: !props.product,
    newNumbers,
  }
  let offset = 0
  const matchNote = !chat && !draft ? match : null
  const people = matchNote?.votesCount ?? 0
  const matchStatus = matchNote ? statusOf(matchNote).label : ""
  const matchLink = matchNote && (
    <a href={postHref(matchNote)}>
      <b>{matchNote.title}</b>
    </a>
  )

  const shareCard = (title: string, onShare: () => void, vora: boolean) => (
    <section className="u2-card" aria-labelledby="u2-card-title">
      <p className="u2-card__lead">
        <span className="u2-logo" aria-hidden="true" />
        {vora ? (
          <Trans id="ui2.card.drafted">Vora drafted your idea. Check the details, then share it.</Trans>
        ) : (
          <Trans id="ui2.card.lead">Nothing like this yet. Share it as a new idea:</Trans>
        )}
      </p>
      <h2 id="u2-card-title" className="u2-card__title">
        {title}
      </h2>
      <label htmlFor="u2-card-details" className="u2-sr">
        <Trans id="ui2.card.detailslabel">Details</Trans>
      </label>
      <textarea
        id="u2-card-details"
        className="u2-card__details"
        readOnly={posting}
        rows={vora ? 5 : 2}
        value={vora && draft ? draft.description : details}
        placeholder={i18n._({ id: "ui2.card.details", message: "Optional: what problem would it solve for you?" })}
        onChange={(e) => (vora && draft ? setDraft({ ...draft, description: e.target.value }) : setDetails(e.target.value))}
      />
      <div className="u2-card__foot">
        <small className="u2-muted">
          <Trans id="ui2.card.postedas">Posted as you. Others can vote for it.</Trans>
        </small>
        {!props.product && products.length > 1 && (
          <label className="u2-card__product">
            <span className="u2-sr">
              <Trans id="newpost.modal.product.label">Product</Trans>
            </span>
            <select
              className="u2-ctl"
              value={chosenProduct}
              // Vora drafted against this product's agent; switching after it would not match its token.
              disabled={posting || vora}
              onChange={(e) => setChosenProduct(parseInt(e.target.value, 10) || 0)}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {canMakePrivate && (
          <label className="u2-check u2-card__private">
            <input type="checkbox" checked={isPrivate} disabled={posting} onChange={(e) => setIsPrivate(e.target.checked)} />
            <span>
              <Trans id="newpost.modal.private.label">Make private</Trans>
            </span>
          </label>
        )}
        {vora && (
          <button type="button" className="u2-btn u2-btn--ghost" onClick={() => setDraft(null)} disabled={posting}>
            <Trans id="ui2.card.discard">Discard</Trans>
          </button>
        )}
        <button type="button" className="u2-btn u2-btn--primary" onClick={onShare} disabled={posting}>
          <Trans id="ui2.card.share">Share idea</Trans>
        </button>
      </div>
    </section>
  )

  const hint = !canShare ? null : gate.required ? (
    <Trans id="ui2.box.hint.required">Type to search. Press Enter to post it, and Vora helps you put it into words.</Trans>
  ) : gate.available ? (
    <Trans id="ui2.box.hint.vora">Type to search. Press Enter to post it, or ask Vora to help you put it into words.</Trans>
  ) : (
    <Trans id="ui2.box.hint">Type to search. Press Enter to post it as a new idea.</Trans>
  )

  return (
    <div className="u2-home">
      <Hero
        heading={heading}
        // Sanitized by markdown.full, the same path classic's <Markdown> uses.
        html={tenant.welcomeMessage ? markdown.full(tenant.welcomeMessage) : ""}
        editHref={teamView ? WELCOME_SETTING : undefined}
      >
        <div className="u2-box">
          <svg className="u2-box__icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            id="u2-box-input"
            className="u2-box__input"
            type="search"
            autoComplete="off"
            value={filter.query}
            // Held while an idea posts, so the reset after it does not erase newer text.
            readOnly={posting}
            placeholder={tenant.invitation || i18n._({ id: "ui2.box.placeholder", message: "Search ideas, or type a new one" })}
            aria-label={i18n._({ id: "ui2.box.label", message: "Search ideas, or type a new one" })}
            aria-describedby="u2-box-hint"
            aria-invalid={errors.length > 0 || undefined}
            onChange={(e) => changeQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault()
                share(filter.query, details)
              } else if (e.key === "Escape") {
                inputRef.current?.blur()
              }
            }}
          />
          <kbd className="u2-kbd u2-box__kbd" aria-hidden="true">
            /
          </kbd>
          {canShare && gate.available && (
            <button type="button" className="u2-btn u2-btn--ghost u2-box__ask" disabled={posting} onClick={() => openChat(query, details)}>
              <span className="u2-logo" aria-hidden="true" />
              <span className="u2-box__long">
                <Trans id="ui2.box.ask">Ask Vora</Trans>
              </span>
              <span className="u2-box__short">Vora</span>
            </button>
          )}
          {canShare && (
            <button type="button" className="u2-btn u2-btn--primary u2-box__share" disabled={posting} onClick={() => share(filter.query, details)}>
              {query ? (
                <Trans id="ui2.vora.go">Share</Trans>
              ) : (
                <>
                  <span className="u2-box__long">{tenant.railCtaButton || <Trans id="ui2.vora.share">Share an idea</Trans>}</span>
                  <span className="u2-box__short">
                    <Trans id="ui2.vora.go">Share</Trans>
                  </span>
                </>
              )}
            </button>
          )}
        </div>
        {hint && (
          <p id="u2-box-hint" className="u2-box__hint">
            {hint}
          </p>
        )}
        {errors.length > 0 && (
          <div className="u2-box__err" role="alert">
            {errors.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </div>
        )}
      </Hero>

      <div className="u2-home__body" onClick={onBoardClick}>
        {chat && (
          <section className="u2-chat" aria-label={i18n._({ id: "ui2.chat.label", message: "Conversation with Vora" })}>
            <button
              type="button"
              className="u2-iconbtn u2-chat__x"
              onClick={() => setChat(null)}
              aria-label={i18n._({ id: "ui2.chat.close", message: "Close Vora" })}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
            <VoraChat
              key={chatKey}
              productId={productId}
              greeting={(tenant.aiAgents?.find((a) => a.productId === productId) ?? tenant.aiAgents?.find((a) => a.productId === null))?.description}
              messages={chat.messages}
              onMessages={(messages) => setChat((c) => c && { ...c, messages })}
              input={chat.input}
              onInput={(input) => setChat((c) => c && { ...c, input })}
              onDone={(res, transcript) => {
                setChat(null)
                setDraft({ title: res.title, description: res.description, brief: res.brief, transcript, voraToken: res.voraToken ?? "" })
              }}
            />
          </section>
        )}

        {draft && shareCard(draft.title, () => post(draft.title, draft.description, draft), true)}

        {matchNote && (
          <section className="u2-match" aria-live="polite">
            <span className="u2-logo" aria-hidden="true" />
            <div>
              <p>
                <Trans id="ui2.match.text">Vora: this sounds like {matchLink}</Trans>{" "}
                <span className="u2-muted">
                  (<Plural id="ui2.match.people" value={people} one="# person" other="# people" />, {matchStatus})
                </span>
              </p>
              <div className="u2-match__acts">
                <VoteButton post={matchNote} size="large" onChange={onVoteChange}>
                  {matchNote.hasVoted ? <Trans id="ui2.match.voted">You voted for it</Trans> : <Trans id="ui2.match.vote">Vote for it</Trans>}
                </VoteButton>
                {canShare && (
                  <button type="button" className="u2-btn u2-btn--ghost" onClick={() => share(query, details)}>
                    <Trans id="ui2.match.different">Mine is different, share it</Trans>
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {shared && (
          <p className="u2-done" role="status" data-state={shared}>
            {shared === "live" ? (
              <Trans id="ui2.share.done">Shared. It is on the board now, and you will hear when it moves.</Trans>
            ) : (
              <Trans id="ui2.share.pending">Shared. It is waiting for approval before others can see it.</Trans>
            )}
          </p>
        )}

        <Briefing hidden={!!query} teamView={teamView} />

        {lonely && shown.length === 0 && !noMatch ? (
          <section className="u2-empty u2-panel">
            {fider.session.isAuthenticated && fider.session.user.isAdministrator && (
              <p>
                <Trans id="home.lonely.suggestion">
                  It&apos;s recommended that you create <strong>at least 3</strong> suggestions here before sharing this site. The initial content is important
                  to start engaging your audience.
                </Trans>
              </p>
            )}
            <p className="u2-muted">
              <Trans id="home.lonely.text">No posts have been created yet.</Trans>
            </p>
          </section>
        ) : (
          <>
            <BoardControls
              filter={filter}
              onChange={(patch) => update(patch)}
              countPerStatus={props.countPerStatus}
              tags={props.tags || []}
              teamView={teamView}
            />
            <div className="u2-board" aria-busy={loading}>
              {searchFailed && (
                <p className="u2-note u2-danger" role="alert">
                  <Trans id="ui2.search.failed">The search could not run. The list below is from before it; try again.</Trans>
                </p>
              )}
              {shown.length > 0 ? (
                stage ? (
                  groups.map((g) => {
                    const open = !folded.has(g.slug)
                    const start = offset
                    if (open) offset += g.posts.length
                    const id = `u2-group-${g.slug}`
                    return (
                      <section key={g.slug} className={`u2-group u2-panel${open ? "" : " is-folded"}`}>
                        <h3 className="u2-group__h">
                          <button type="button" aria-expanded={open} aria-controls={id} onClick={() => toggleGroup(g.slug)}>
                            <StatusPill status={statusInfo(tenant, g.slug)} />
                            <span className="u2-group__n u2-mono">{g.posts.length}</span>
                            <svg className="u2-group__chev" viewBox="0 0 24 24" aria-hidden="true">
                              <path d="m6 9 6 6 6-6" />
                            </svg>
                          </button>
                        </h3>
                        <div id={id} hidden={!open}>
                          {open && g.posts.length > 0 && <IdeaTable {...tableProps} posts={g.posts} offset={start} label={statusLabel(g.slug)} />}
                          {open && g.posts.length === 0 && (
                            <p className="u2-group__empty u2-muted">
                              <Trans id="ui2.board.groupempty">No ideas here yet.</Trans>
                            </p>
                          )}
                        </div>
                      </section>
                    )
                  })
                ) : (
                  <div className="u2-board__list u2-panel">
                    <IdeaTable {...tableProps} posts={shown} />
                  </div>
                )
              ) : searchFailed ? null : noMatch ? (
                shareCard(query, () => share(query, details), false)
              ) : loading ? null : (
                <p className="u2-empty u2-panel u2-muted">
                  <Trans id="home.postscontainer.label.noresults">No results matched your search, try something different.</Trans>
                </p>
              )}
              {canLoadMore && (
                <div className="u2-more">
                  <a
                    className="u2-btn u2-btn--ghost"
                    href={moreHref}
                    onClick={(e) => {
                      e.preventDefault()
                      update({ limit: limit + 10 }, false)
                    }}
                  >
                    <Trans id="ui2.board.loadmore">Load more</Trans>
                  </a>
                </div>
              )}
              <div className="u2-hint" aria-hidden="true">
                <span>
                  <kbd className="u2-kbd">/</kbd> <Trans id="ui2.hint.search">search</Trans>
                </span>
                <span>
                  <kbd className="u2-kbd">J</kbd> <kbd className="u2-kbd">K</kbd> <Trans id="ui2.hint.move">move</Trans>
                </span>
                <span>
                  <kbd className="u2-kbd">V</kbd> <Trans id="ui2.hint.vote">vote</Trans>
                </span>
                <span>
                  <kbd className="u2-kbd">Enter</kbd> <Trans id="ui2.hint.open">open</Trans>
                </span>
                {staff && (
                  <span>
                    <kbd className="u2-kbd">M</kbd> <Trans id="ui2.hint.merge">merge</Trans>
                  </span>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      {selectedPostId !== null && (
        <Suspense fallback={null}>
          <IdeaOverlay number={selectedPostId} onClose={handleCloseOverlay} onDataChanged={() => setIsPostDirty(true)} />
        </Suspense>
      )}
    </div>
  )
}

export default HomePage
