import React, { useEffect, useState } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Post, PostStatus, Vote, AIMessage, statusListFor, statusLabel } from "@fider/models"
import { actions, copyToClipboard, Failure, navigator } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Modal } from "../../components/feedback/Modal"
import { Avatar } from "../../components/feedback/Avatar"
import { toast } from "../../components/feedback/toast"
import { Button, Form, Select, TextArea, TextInput } from "../../components/form"
import { Markdown } from "../../components/content/Markdown"
import { StatusPill } from "../../components/StatusPill"
import { statusInfo } from "../../lib/status"

const DUPLICATE = PostStatus.Duplicate.value
const SEARCH_DELAY = 500

const dateOf = (locale: string, d: string | Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(d))

// Finds the idea to merge into: the same search classic's PostSearch runs.
const PostSearch = (props: { exclude: number; selected?: number; onSelect: (n: number) => void }) => {
  const fider = useFider()
  const [query, setQuery] = useState("")
  const [posts, setPosts] = useState<Post[]>([])
  const [target, setTarget] = useState<Post | undefined>(undefined)

  // A prefilled target (from "#merge=N") shows its title.
  useEffect(() => {
    if (!props.selected || target?.number === props.selected) return
    let live = true
    actions.getPost(props.selected).then((r) => live && r.ok && setTarget(r.data))
    return () => {
      live = false
    }
  }, [props.selected])

  useEffect(() => {
    if (!query) return
    const timer = window.setTimeout(() => {
      actions.searchPosts({ query, limit: 6 }).then((res) => {
        if (res.ok) setPosts((res.data || []).filter((p) => p.number !== props.exclude))
      })
    }, SEARCH_DELAY)
    return () => window.clearTimeout(timer)
  }, [query])

  const pick = (p: Post) => {
    setTarget(p)
    props.onSelect(p.number)
  }

  return (
    <>
      <TextInput
        stacked
        name="originalNumber"
        type="search"
        label={<Trans id="ui2.idea.merge.into">Merge into</Trans>}
        placeholder={i18n._({ id: "showpost.postsearch.query.placeholder", message: "Search original post..." })}
        value={query}
        onChange={setQuery}
      />
      {props.selected ? (
        <p className="u2-idea__target" data-target={props.selected}>
          <span className="u2-mono">#{props.selected}</span> {target?.title}
        </p>
      ) : null}
      {posts.length > 0 && (
        <ul className="u2-idea__results">
          {posts.map((p) => (
            <li key={p.id}>
              <button type="button" aria-pressed={props.selected === p.number} onClick={() => pick(p)}>
                <span className="u2-mono">#{p.number}</span>
                <span className="u2-idea__results-title">{p.title}</span>
                <StatusPill status={statusInfo(fider.session.tenant, p.status, p.statusKind)} />
                <span className="u2-muted">
                  <Plural id="ui2.idea.search.votes" value={p.votesCount} one="# vote" other="# votes" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

interface ResponseDialogProps {
  post: Post
  open: boolean
  // "#merge=N" opens the dialog on Duplicate with #N chosen.
  initialStatus?: string
  initialOriginal?: number
  onClose: () => void
  onResponded: () => void
}

// Staff status response: status, the response text, or a duplicate merge.
export const ResponseDialog = (props: ResponseDialogProps) => {
  const fider = useFider()
  const [status, setStatus] = useState(props.initialStatus || props.post.status)
  const [text, setText] = useState(props.post.response?.text || "")
  const [originalNumber, setOriginalNumber] = useState(props.initialOriginal || 0)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!props.open) return
    setStatus(props.initialStatus || props.post.status)
    setOriginalNumber(props.initialOriginal || 0)
    setText(props.post.response?.text || "")
    setError(undefined)
  }, [props.open, props.initialStatus, props.initialOriginal])

  const options = statusListFor(fider.session.tenant).map((s) => ({
    value: s.value,
    label: statusLabel(s, (id, fallback) => i18n._(id, { message: fallback })),
  }))

  const submit = async () => {
    if (busy) return
    setBusy(true)
    try {
      const result = await actions.respond(props.post.number, { status, text, originalNumber })
      if (result.ok) props.onResponded()
      else setError(result.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      wide
      locked={busy}
      title={<Trans id="action.respond">Update Status</Trans>}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={busy}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            <Trans id="action.submit">Submit</Trans>
          </Button>
        </>
      }
    >
      <Form error={error} onSubmit={submit} className="u2-idea__respond">
        <Select stacked name="status" label={<Trans id="ui2.idea.status">Status</Trans>} value={status} options={options} onChange={setStatus} />
        {status === DUPLICATE ? (
          <>
            <PostSearch exclude={props.post.number} selected={originalNumber || undefined} onSelect={setOriginalNumber} />
            <p className="u2-muted">
              <Trans id="showpost.responseform.message.mergedvotes">Votes from this post will be merged into original post.</Trans>
            </p>
          </>
        ) : (
          <TextArea
            stacked
            name="text"
            rows={5}
            label={<Trans id="ui2.idea.response">Response</Trans>}
            placeholder={i18n._({
              id: "showpost.responseform.text.placeholder",
              message: "What's going on with this post? Let your users know what are your plans...",
            })}
            value={text}
            onChange={setText}
          />
        )}
      </Form>
    </Modal>
  )
}

// Administrators delete an idea with an optional reason; it cannot be undone.
export const DeleteDialog = (props: { post: Post; open: boolean; onClose: () => void }) => {
  const [text, setText] = useState("")
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    setBusy(true)
    const response = await actions.deletePost(props.post.number, text)
    setBusy(false)
    if (response.ok) {
      props.onClose()
      navigator.goHome()
    } else {
      setError(response.error)
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      locked={busy}
      title={<Trans id="ui2.idea.delete.title">Delete this idea</Trans>}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose} disabled={busy}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
          <Button variant="danger-solid" onClick={remove} loading={busy}>
            <Trans id="action.delete">Delete</Trans>
          </Button>
        </>
      }
    >
      <Form error={error} onSubmit={remove}>
        <TextArea
          stacked
          name="text"
          label={<Trans id="ui2.idea.delete.reason">Reason (optional)</Trans>}
          hint={<Trans id="ui2.idea.delete.hint">This cannot be undone.</Trans>}
          placeholder={i18n._({ id: "showpost.moderationpanel.text.placeholder", message: "Why are you deleting this post? (optional)" })}
          value={text}
          onChange={setText}
        />
      </Form>
    </Modal>
  )
}

// Staff only (the caller gates it): everyone who voted, with a name filter.
export const VotersDialog = (props: { post: Post; open: boolean; onClose: () => void }) => {
  const fider = useFider()
  const [all, setAll] = useState<Vote[] | null>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    if (!props.open) return
    actions.listVotes(props.post.number).then((r) => setAll(r.ok ? r.data : []))
  }, [props.open])

  const shown = (all || []).filter((v) => v.user.name.toLowerCase().includes(query.toLowerCase()))

  return (
    <Modal open={props.open} onClose={props.onClose} title={<Trans id="ui2.idea.voters.title">Who voted</Trans>}>
      <Form>
        <TextInput
          stacked
          name="query"
          type="search"
          label={<Trans id="ui2.idea.voters.filter">Filter by name</Trans>}
          placeholder={i18n._({ id: "modal.showvotes.query.placeholder", message: "Search for users by name..." })}
          value={query}
          onChange={setQuery}
        />
      </Form>
      {all === null ? (
        <p className="u2-muted" aria-busy="true">
          <Trans id="ui2.peek.loading">Loading…</Trans>
        </p>
      ) : (
        <ul className="u2-idea__voters">
          {shown.map((v) => (
            <li key={v.user.id}>
              <Avatar name={v.user.name} src={v.user.avatarURL} size={28} />
              <span className="u2-idea__voter">
                <b>{v.user.name}</b>
                {v.user.email && <span className="u2-muted">{v.user.email}</span>}
              </span>
              <span className="u2-muted u2-mono">{dateOf(fider.currentLocale, v.createdAt)}</span>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="u2-muted">
              <Trans id="ui2.idea.voters.none">Nobody matches that name.</Trans>
            </li>
          )}
        </ul>
      )}
    </Modal>
  )
}

// The idea's comment feed (when feeds are on): the address to paste into a reader.
export const FeedDialog = (props: { url: string; open: boolean; onClose: () => void }) => {
  const copy = () =>
    copyToClipboard(props.url).then(
      () => toast.success(i18n._({ id: "ui2.idea.feed.copied", message: "Feed address copied." })),
      () => undefined
    )
  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={<Trans id="modal.rss.title">Subscribe to ATOM feed</Trans>}
      footer={
        <>
          <a className="u2-btn u2-btn--ghost" href={props.url}>
            <Trans id="ui2.idea.feed.open">Open the feed</Trans>
          </a>
          <Button variant="primary" onClick={copy}>
            <Trans id="ui2.idea.feed.copy">Copy address</Trans>
          </Button>
        </>
      }
    >
      <Form>
        <TextInput
          stacked
          readOnly
          name="feed"
          label={<Trans id="modal.rss.description">To subscribe to this ATOM feed, copy and paste this URL into your RSS/ATOM reader.</Trans>}
          value={props.url}
          onChange={() => undefined}
          onFocus={(e) => e.currentTarget.select()}
        />
      </Form>
    </Modal>
  )
}

// Administrators read the conversation the brief came from (as classic's brief modal does).
export const TranscriptDialog = (props: { postNumber: number; open: boolean; onClose: () => void }) => {
  const [chat, setChat] = useState<AIMessage[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!props.open || chat) return
    actions.getBriefTranscript(props.postNumber).then((r) => (r.ok && r.data.messages ? setChat(r.data.messages) : setFailed(true)))
  }, [props.open])

  return (
    <Modal open={props.open} onClose={props.onClose} wide title={<Trans id="ui2.idea.brief.transcript">Conversation with Vora</Trans>}>
      {failed ? (
        <p className="u2-muted">
          <Trans id="ui2.idea.brief.notranscript">This conversation is not available.</Trans>
        </p>
      ) : !chat ? (
        <p className="u2-muted" aria-busy="true">
          <Trans id="ui2.peek.loading">Loading…</Trans>
        </p>
      ) : (
        <ol className="u2-idea__chat">
          {chat.map((m, i) => (
            <li key={i} className={m.role === "assistant" ? "is-vora" : "is-person"}>
              {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  )
}
