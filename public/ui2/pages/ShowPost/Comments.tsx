import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Comment, Post, ReactionCount, isCollaborator } from "@fider/models"
import { actions, cache, copyToClipboard, Failure } from "@fider/services"
import { useFider } from "@fider/hooks"
import { useAttachments } from "@fider/hooks/useAttachments"
import { Avatar } from "../../components/feedback/Avatar"
import { ConfirmDialog } from "../../components/feedback/ConfirmDialog"
import { toast } from "../../components/feedback/toast"
import { Button, Form, Toggle } from "../../components/form"
import { MarkdownEditor } from "../../components/form/MarkdownEditor"
import { Markdown } from "../../components/content/Markdown"
import { signInHref } from "../../lib/nav"
import { canEditComment, isStaff } from "./rules"

const MAX_LENGTH = 4000
const MAX_IMAGES = 2
const MAX_IMAGE_KB = 5 * 1024
const EMOJIS = ["👍", "👎", "😄", "🎉", "😕", "❤️", "🚀", "👀"]
// Same draft keys as classic's CommentInput, so a draft survives a switch between the looks.
const DRAFT_KEY = "CommentInput-Comment-Title-"
const DRAFT_FILES_KEY = "CommentInput-Comment-Attachments-"

const dateOf = (locale: string, d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(d))

// Applies one reaction toggle to the counts, the way classic's ShowComment does.
export const applyReaction = (counts: ReactionCount[], emoji: string, added: boolean): ReactionCount[] => {
  const next = [...counts]
  const i = next.findIndex((r) => r.emoji === emoji)
  if (i === -1) return added ? [...next, { emoji, count: 1, includesMe: true }] : next
  const count = next[i].count + (added ? 1 : -1)
  if (count <= 0) next.splice(i, 1)
  else next[i] = { ...next[i], count, includesMe: added }
  return next
}

const Reactions = (props: { post: Post; comment: Comment }) => {
  const fider = useFider()
  const [counts, setCounts] = useState<ReactionCount[]>(props.comment.reactionCounts || [])
  const [picking, setPicking] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const signedIn = fider.session.isAuthenticated

  useEffect(() => {
    if (!picking) return
    const away = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setPicking(false)
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      e.stopPropagation()
      setPicking(false)
    }
    document.addEventListener("mousedown", away)
    document.addEventListener("keydown", esc, true)
    return () => {
      document.removeEventListener("mousedown", away)
      document.removeEventListener("keydown", esc, true)
    }
  }, [picking])

  const toggle = async (emoji: string) => {
    setPicking(false)
    const r = await actions.toggleCommentReaction(props.post.number, props.comment.id, emoji)
    if (r.ok) setCounts((c) => applyReaction(c, emoji, r.data.added))
  }

  if (!signedIn && counts.length === 0) return null
  return (
    <div className="u2-react" ref={ref}>
      {counts.map((r) =>
        signedIn ? (
          <button
            key={r.emoji}
            type="button"
            className={r.includesMe ? "u2-react__b is-on" : "u2-react__b"}
            aria-pressed={r.includesMe}
            onClick={() => toggle(r.emoji)}
          >
            {r.emoji} <span className="u2-mono">{r.count}</span>
          </button>
        ) : (
          <span key={r.emoji} className="u2-react__b">
            {r.emoji} <span className="u2-mono">{r.count}</span>
          </span>
        )
      )}
      {signedIn && (
        <button
          type="button"
          className="u2-react__b u2-react__add"
          aria-expanded={picking}
          aria-label={i18n._({ id: "ui2.idea.react.add", message: "Add a reaction" })}
          onClick={() => setPicking(!picking)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="12" r="8" />
            <path d="M8 14c1.5 2 4.5 2 6 0M8.5 10h.01M13.5 10h.01" />
          </svg>
        </button>
      )}
      {picking && (
        <div className="u2-react__pick u2-panel" role="group" aria-label={i18n._({ id: "ui2.idea.react.add", message: "Add a reaction" })}>
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => toggle(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface CommentItemProps {
  post: Post
  comment: Comment
  highlighted: boolean
  onChanged: () => void
}

export const CommentItem = (props: CommentItemProps) => {
  const fider = useFider()
  const { comment } = props
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(comment.content)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const { attachments, handleImageUploaded, getImageSrc } = useAttachments({ maxAttachments: MAX_IMAGES })
  const ref = useRef<HTMLElement>(null)
  const staff = isStaff(fider)
  const mine = fider.session.isAuthenticated && fider.session.user.id === comment.user.id
  const team = isCollaborator(comment.user.role)

  useEffect(() => {
    if (props.highlighted) ref.current?.scrollIntoView?.({ block: "center" })
  }, [props.highlighted])

  const save = async () => {
    setBusy(true)
    const r = await actions.updateComment(props.post.number, comment.id, content, attachments)
    setBusy(false)
    if (r.ok) {
      setEditing(false)
      props.onChanged()
    } else setError(r.error)
  }

  const remove = async () => {
    const r = await actions.deleteComment(props.post.number, comment.id)
    if (r.ok) {
      setConfirmDelete(false)
      props.onChanged()
    }
  }

  const moderate = async (approve: boolean) => {
    const r = approve ? await actions.approveComment(comment.id) : await actions.declineComment(comment.id)
    if (r.ok) {
      toast.success(
        approve
          ? i18n._({ id: "showpost.moderation.comment.approved", message: "Comment approved successfully" })
          : i18n._({ id: "showpost.moderation.comment.declined", message: "Comment declined successfully" })
      )
      props.onChanged()
    } else {
      toast.error(
        approve
          ? i18n._({ id: "showpost.moderation.comment.approveerror", message: "Failed to approve comment" })
          : i18n._({ id: "showpost.moderation.comment.declineerror", message: "Failed to decline comment" })
      )
    }
  }

  const copyLink = () => {
    const url = `${location.origin}${location.pathname}#comment-${comment.id}`
    copyToClipboard(url).then(
      () => toast.success(i18n._({ id: "showpost.comment.copylink.success", message: "Successfully copied comment link to clipboard" })),
      () => toast.error(i18n._({ id: "showpost.comment.copylink.error", message: "Could not copy comment link, please copy page URL" }))
    )
  }

  const cls = ["u2-cm", comment.isInternal && "is-internal", props.highlighted && "is-highlighted"].filter(Boolean).join(" ")
  const editedBy = comment.editedBy?.name || ""
  return (
    <article id={`comment-${comment.id}`} ref={ref} className={cls}>
      <Avatar name={comment.user.name} src={comment.user.avatarURL} size={32} />
      <div className="u2-cm__body">
        <div className="u2-cm__who">
          <b>{comment.user.name}</b>
          {team && (
            <span className="u2-cm__team">
              <Trans id="ui2.idea.comment.team">team</Trans>
            </span>
          )}
          {comment.isInternal && (
            <span className="u2-chip u2-chip--warn">
              <Trans id="showpost.comment.internal">Internal</Trans>
            </span>
          )}
          <span className="u2-muted">
            <time dateTime={comment.createdAt}>{dateOf(fider.currentLocale, comment.createdAt)}</time>
            {comment.editedAt && editedBy && (
              <>
                {" · "}
                <Trans id="ui2.idea.comment.edited">edited by {editedBy}</Trans>
              </>
            )}
          </span>
          {!editing && (
            <span className="u2-cm__acts">
              <button type="button" className="u2-idea__lnk" onClick={copyLink}>
                <Trans id="action.copylink">Copy link</Trans>
              </button>
              {canEditComment(fider, comment.user.id) && (
                <>
                  <button type="button" className="u2-idea__lnk" onClick={() => setEditing(true)}>
                    <Trans id="action.edit">Edit</Trans>
                  </button>
                  <button type="button" className="u2-idea__lnk u2-danger" onClick={() => setConfirmDelete(true)}>
                    <Trans id="action.delete">Delete</Trans>
                  </button>
                </>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <Form error={error} onSubmit={save}>
            <MarkdownEditor
              field="content"
              label={i18n._({ id: "ui2.idea.comment.editlabel", message: "Edit comment" })}
              initialValue={comment.content}
              onChange={setContent}
              onImageUploaded={handleImageUploaded}
              onGetImageSrc={getImageSrc}
              maxAttachments={MAX_IMAGES}
              maxImageSizeKB={MAX_IMAGE_KB}
              maxLength={MAX_LENGTH}
            />
            <div className="u2-row">
              <Button variant="primary" small onClick={save} loading={busy} disabled={content.length > MAX_LENGTH}>
                <Trans id="action.save">Save</Trans>
              </Button>
              <Button
                variant="ghost"
                small
                onClick={() => {
                  setEditing(false)
                  setContent(comment.content)
                  setError(undefined)
                }}
              >
                <Trans id="action.cancel">Cancel</Trans>
              </Button>
            </div>
          </Form>
        ) : (
          <>
            <Markdown text={comment.content} />
            {fider.session.tenant.isModerationEnabled && !comment.isApproved && (
              <div className="u2-idea__mod">
                {mine && !staff && <Trans id="showpost.moderation.comment.awaiting">Awaiting moderation.</Trans>}
                {staff && (
                  <>
                    <span>
                      <Trans id="showpost.moderation.comment.admin.description">This comment needs your approval before being published</Trans>
                    </span>
                    <span className="u2-row">
                      <Button small variant="primary" onClick={() => moderate(true)}>
                        <Trans id="action.publish">Publish</Trans>
                      </Button>
                      <Button small variant="danger" onClick={() => moderate(false)}>
                        <Trans id="action.delete">Delete</Trans>
                      </Button>
                    </span>
                  </>
                )}
              </div>
            )}
            <Reactions post={props.post} comment={comment} />
          </>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        danger
        title={<Trans id="modal.deletecomment.header">Delete Comment</Trans>}
        confirmLabel={<Trans id="action.delete">Delete</Trans>}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>
          <Trans id="ui2.idea.comment.deletetext">This cannot be undone.</Trans>
        </p>
      </ConfirmDialog>
    </article>
  )
}

interface ComposerProps {
  post: Post
  onPosted: () => void
}

// Focuses the composer's editing area once the editor has rendered it.
export const focusComposer = (root: HTMLElement | null, tries = 20) => {
  const el = root?.querySelector<HTMLElement>(".ProseMirror, .u2-md__raw")
  if (el) {
    el.focus()
    el.scrollIntoView?.({ block: "center" })
  } else if (tries > 0) {
    window.requestAnimationFrame(() => focusComposer(root, tries - 1))
  }
}

export const CommentComposer = (props: ComposerProps) => {
  const fider = useFider()
  const key = `${DRAFT_KEY}${props.post.id}`
  const [draft, setDraft] = useState<string>(() => cache.session.get(key) || "")
  const [internal, setInternal] = useState(false)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [round, setRound] = useState(0)
  const ref = useRef<HTMLElement>(null)
  const { attachments, handleImageUploaded, getImageSrc, clearAttachments } = useAttachments({
    cacheKey: `${DRAFT_FILES_KEY}${props.post.id}`,
    maxAttachments: MAX_IMAGES,
  })
  const staff = isStaff(fider)

  // "#comment" (the board's "Ask for details") lands in the composer.
  useEffect(() => {
    const onHash = () => location.hash === "#comment" && focusComposer(ref.current)
    onHash()
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  if (!fider.session.isAuthenticated) {
    return (
      <section id="comment" className="u2-compose u2-compose--out" ref={ref}>
        <a className="u2-btn" href={signInHref()}>
          <Trans id="ui2.idea.comment.signin">Sign in to comment</Trans>
        </a>
      </section>
    )
  }

  const change = (value: string) => {
    setDraft(value)
    cache.session.set(key, value)
  }

  const submit = async () => {
    if (busy) return
    setError(undefined)
    setBusy(true)
    try {
      const result = await actions.createComment(props.post.number, draft, attachments, staff && internal)
      if (!result.ok) {
        setError(result.error)
        return
      }
      cache.session.remove(key)
      clearAttachments()
      setDraft("")
      setInternal(false)
      setRound((r) => r + 1)
      if (fider.session.isModerationRequiredForNewPost) {
        toast.success(i18n._({ id: "ui2.idea.comment.moderation", message: "Your comment is awaiting moderation." }))
      }
      props.onPosted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section id="comment" className={internal ? "u2-compose is-internal" : "u2-compose"} ref={ref}>
      <Form error={error} onSubmit={submit}>
        <MarkdownEditor
          key={round}
          field="content"
          label={i18n._({ id: "showpost.commentinput.placeholder", message: "Leave a comment" })}
          placeholder={i18n._({ id: "showpost.commentinput.placeholder", message: "Leave a comment" })}
          initialValue={round === 0 ? draft : ""}
          onChange={change}
          onImageUploaded={handleImageUploaded}
          onGetImageSrc={getImageSrc}
          onGetUpload={(bkey) => attachments.find((a) => a.bkey === bkey)?.upload}
          maxAttachments={MAX_IMAGES}
          maxImageSizeKB={MAX_IMAGE_KB}
          maxLength={MAX_LENGTH}
          // Locked while posting, so text typed meanwhile is not cleared with the sent comment.
          disabled={fider.isReadOnly || busy}
        />
        <div className="u2-compose__foot">
          {staff && (
            <Toggle
              checked={internal}
              onChange={setInternal}
              label={<Trans id="ui2.idea.comment.internal">Team only: just your team sees this comment</Trans>}
            />
          )}
          <Button variant="primary" onClick={submit} loading={busy} disabled={fider.isReadOnly || draft.length > MAX_LENGTH}>
            <Trans id="action.postcomment">Post</Trans>
          </Button>
        </div>
      </Form>
    </section>
  )
}
