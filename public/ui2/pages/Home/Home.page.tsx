import "./home.css"

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Post, Tag, Product, PostStatus } from "@fider/models"
import { actions, cache, markdown } from "@fider/services"
import { useFider, usePostOverlay } from "@fider/hooks"
import { SidebarSlot } from "../../shell/Shell"
import { IdeaTable } from "../../components/IdeaTable"
import { PeekPanel, PeekDetails } from "../../components/PeekPanel"
import { useRowKeys } from "../../components/useRowKeys"
import { statusInfo } from "../../lib/status"
import { BoardInsights, Voter, duplicateOf, fetchInsights } from "../../lib/insights"
import { postHref, replaceQuery } from "../../lib/nav"
import { requestShare } from "../../lib/share"
import { toast } from "../../components/feedback/toast"
import { VoraBar, modKey } from "./VoraBar"
import { BoardControls } from "./BoardControls"
import { Briefing } from "./Briefing"
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

export const NUDGE_KEY = "ui2.nudge.dismissed"
const SEARCH_DELAY = 300

// The welcome header marks emphasis with _underscores_, as in classic.
const welcomeHeader = (text: string): React.ReactNode[] =>
  text.split(/_([^_]+)_/g).map((part, i) =>
    i % 2 === 1 ? (
      <em key={i} className="u2-home__em">
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

const HomePage = (props: HomePageProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const signedIn = fider.session.isAuthenticated
  const staff = signedIn && fider.session.user.isCollaborator
  const canShare = !fider.isReadOnly

  const [filter, setFilter] = useState<BoardFilter>(filterFromURL)
  const [posts, setPosts] = useState<Post[]>(props.posts || [])
  const [loading, setLoading] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [newNumbers, setNewNumbers] = useState<Set<number>>(new Set())
  const [insights, setInsights] = useState<BoardInsights | null>(null)
  const [voters, setVoters] = useState<{ [num: number]: Voter[] }>({})
  const [focused, setFocused] = useState(-1)
  const [peekClosed, setPeekClosed] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(() => cache.local.has(NUDGE_KEY))
  const seq = useRef(0)
  const searchTimer = useRef<number>()

  // Opening an idea shows it over the board and pushes its URL, as classic's overlay does;
  // Esc, the close button or Back return to the board URL.
  const { selectedPostId, handlePostClick, handleCloseOverlay, setIsPostDirty } = usePostOverlay({
    basePath: props.product ? `/p/${props.product.slug}` : "/",
    onPostClosed: (num) => actions.getPost(num).then((r) => r.ok && r.data && setPosts((list) => list.map((p) => (p.number === num ? r.data : p)))),
  })
  const openIdea = (href: string) => {
    const m = /^\/posts\/(\d+)\/([^/?#]*)(#.*)?$/.exec(href)
    if (!m) return false
    handlePostClick(parseInt(m[1], 10), m[2])
    // "#merge=N" and "#comment" ride along for the idea view to act on.
    if (m[3]) history.replaceState(history.state, "", `/posts/${m[1]}/${m[2]}${m[3]}`)
    return true
  }
  // Idea links on the board (titles, Vora notes, the peek's "Open idea") open the overlay;
  // modified clicks (new tab, new window) keep the browser's default.
  const onBoardClick = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as HTMLElement).closest?.("a[href^='/posts/']")
    if (a && openIdea(a.getAttribute("href") || "")) e.preventDefault()
  }

  const statusOf = (p: Post) => statusInfo(tenant, p.status, p.statusKind)
  const statusLabel = (slug: string) => statusInfo(tenant, slug).label

  // Refresh the list through the same search API classic uses; stale answers are dropped.
  const update = (patch: Partial<BoardFilter>, reset = true) => {
    const next = { ...filter, ...patch }
    setFilter(next)
    replaceQuery(filterToQuery(next))
    setLoading(true)
    const id = ++seq.current
    const before = new Set(posts.map((p) => p.number))
    window.clearTimeout(searchTimer.current)
    searchTimer.current = window.setTimeout(
      () => {
        actions
          .searchPosts(searchParams(next, props.product?.id))
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
            if (reset) setFocused(-1)
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

  useEffect(() => () => window.clearTimeout(searchTimer.current), [])

  // Insights for the visible rows; any failure hides the features that need them.
  const numbersKey = posts.map((p) => p.number).join(",")
  useEffect(() => {
    let live = true
    fetchInsights(posts.map((p) => p.number)).then((data) => live && setInsights(data))
    return () => {
      live = false
    }
  }, [numbersKey])

  const onVoteChange = (num: number, voted: boolean, count: number) =>
    setPosts((list) => list.map((p) => (p.number === num ? { ...p, hasVoted: voted, votesCount: count } : p)))

  const onDetails = (num: number, d: PeekDetails) => d.voters.length > 0 && setVoters((v) => ({ ...v, [num]: d.voters }))

  // ShareIdea (components/share) claims the event and sends signed-out people to sign in.
  // Nobody claims it only when the share host failed to load (read-only hides the buttons).
  const share = (title: string) => {
    if (!requestShare(title)) {
      toast.error(i18n._({ id: "ui2.share.unavailable", message: "Sharing ideas did not load. Reload the page and try again." }))
    }
  }

  const focusRow = (i: number) => {
    setFocused(i)
    setPeekClosed(false)
  }

  useRowKeys({
    // The overlay owns the keyboard while it is open.
    count: selectedPostId === null ? posts.length : 0,
    focused,
    setFocused: focusRow,
    onVote: (i) => document.querySelector<HTMLButtonElement>(`.u2-tr[data-index="${i}"] .u2-vote`)?.click(),
    onOpen: (i) => openIdea(postHref(posts[i])),
    // Merge into Vora's likely original when it has one, else the merge dialog opens empty.
    onMerge: staff
      ? (i) => {
          const of = duplicateOf(insights, posts[i].number)
          openIdea(postHref(posts[i], of ? `#merge=${of}` : "#merge"))
        }
      : undefined,
    onEscape: () => setPeekClosed(true),
  })

  const peekPost = useMemo(() => {
    if (peekClosed) return undefined
    // The peek follows the selected row only (click or J/K), never the mouse.
    return focused >= 0 && focused < posts.length ? posts[focused] : undefined
  }, [peekClosed, focused, posts])

  const lonely = isLonely(props.countPerStatus)
  const neverVoted = !(props.posts || []).some((p) => p.hasVoted)
  const showNudge = !lonely && !nudgeDismissed && (!signedIn || (!staff && neverVoted))
  const dismissNudge = () => {
    cache.local.set(NUDGE_KEY, "true")
    setNudgeDismissed(true)
  }

  const limit = filter.limit || DEFAULT_LIMIT
  const canLoadMore = posts.length >= limit
  const moreHref = location.pathname + filterToQuery({ ...filter, limit: limit + 10 })
  const query = filter.query.trim()
  const productName = props.product?.name
  const shareLabel = tenant.railCtaButton || i18n._({ id: "ui2.vora.share", message: "Share an idea" })
  const welcome =
    tenant.welcomeMessage ||
    i18n._({
      id: "home.form.defaultwelcomemessage",
      message: `We'd love to hear what you're thinking about.

What can we do better? This is the place for you to vote, discuss and share ideas.`,
    })

  return (
    <div className="u2-home">
      <SidebarSlot>
        <Briefing />
      </SidebarSlot>

      <header className="u2-home__head">
        <h1 className="u2-home__title">
          {props.product ? (
            <Trans id="ui2.home.producttitle">What should we build next for {productName}?</Trans>
          ) : tenant.welcomeHeader ? (
            welcomeHeader(tenant.welcomeHeader)
          ) : (
            <Trans id="home.head.title">What should we build next?</Trans>
          )}
        </h1>
        {/* Sanitized by markdown.full, the same path classic's <Markdown> uses. */}
        <div className="u2-home__welcome" dangerouslySetInnerHTML={{ __html: markdown.full(welcome) }} />
      </header>

      <VoraBar
        query={filter.query}
        onQueryChange={(q) => update({ query: q })}
        noiseWords={props.searchNoiseWords || []}
        shareLabel={shareLabel}
        canShare={canShare}
        onShare={share}
        onVoteChange={onVoteChange}
        boardPosts={posts}
      />

      {lonely ? (
        <section className="u2-empty u2-panel">
          {fider.session.isAuthenticated && fider.session.user.isAdministrator && (
            <p>
              <Trans id="home.lonely.suggestion">
                It&apos;s recommended that you create <strong>at least 3</strong> suggestions here before sharing this site. The initial content is important to
                start engaging your audience.
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
            countPerProduct={props.countPerProduct}
            tags={props.tags || []}
            scoped={!!props.product}
          />
          <div className={`u2-board${peekPost ? " has-peek" : ""}`} onClick={onBoardClick}>
            <div className="u2-board__list u2-panel" aria-busy={loading}>
              {showNudge && (
                <div className="u2-nudge">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                  <p>
                    <Trans id="ui2.nudge.text">Vote on what you want built. We post an update on every idea we act on.</Trans>
                  </p>
                  <button type="button" className="u2-iconbtn" onClick={dismissNudge} aria-label={i18n._({ id: "ui2.nudge.dismiss", message: "Dismiss" })}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </div>
              )}
              {searchFailed && (
                <p className="u2-note u2-danger" role="alert">
                  <Trans id="ui2.search.failed">The search could not run. The list below is from before it; try again.</Trans>
                </p>
              )}
              {searchFailed && posts.length === 0 ? null : posts.length > 0 ? (
                <IdeaTable
                  posts={posts}
                  staff={staff}
                  focused={focused}
                  onFocus={focusRow}
                  statusOf={statusOf}
                  statusLabel={statusLabel}
                  onVoteChange={onVoteChange}
                  insights={insights}
                  voters={voters}
                  tags={props.tags}
                  showProduct={!props.product}
                  showPending={tenant.isModerationEnabled}
                  newNumbers={newNumbers}
                />
              ) : loading ? null : query ? (
                <div className="u2-empty">
                  <h2>
                    <Trans id="ui2.empty.title">Nothing on {query} yet. Be the first.</Trans>
                  </h2>
                  <p className="u2-muted">
                    <Trans id="ui2.empty.text">Vora asks a few questions so the team gets what it needs to act on it.</Trans>
                  </p>
                  {canShare && (
                    <button type="button" className="u2-btn u2-btn--primary" onClick={() => share(query)}>
                      <Trans id="ui2.empty.share">Share it with Vora</Trans>
                    </button>
                  )}
                </div>
              ) : (
                <p className="u2-empty u2-muted">
                  <Trans id="home.postscontainer.label.noresults">No results matched your search, try something different.</Trans>
                </p>
              )}
              {canLoadMore && (
                <div className="u2-more">
                  <a
                    href={moreHref}
                    onClick={(e) => {
                      e.preventDefault()
                      update({ limit: limit + 10 }, false)
                    }}
                  >
                    <Trans id="home.postscontainer.label.viewmore">View more posts</Trans>
                  </a>
                </div>
              )}
              <div className="u2-hint" aria-hidden="true">
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
                <span>
                  <kbd className="u2-kbd">{modKey()}</kbd> <Trans id="ui2.hint.vora">Vora</Trans>
                </span>
                <span>
                  <kbd className="u2-kbd">Esc</kbd> <Trans id="ui2.hint.close">close</Trans>
                </span>
              </div>
            </div>
            {peekPost && (
              <PeekPanel
                post={peekPost}
                status={statusOf(peekPost)}
                staff={staff}
                signedIn={signedIn}
                locale={fider.currentLocale}
                onVoteChange={onVoteChange}
                onDetails={onDetails}
                onClose={() => setPeekClosed(true)}
              />
            )}
          </div>
        </>
      )}
      {selectedPostId !== null && (
        <Suspense fallback={null}>
          <IdeaOverlay number={selectedPostId} onClose={handleCloseOverlay} onDataChanged={() => setIsPostDirty(true)} />
        </Suspense>
      )}
    </div>
  )
}

export default HomePage
