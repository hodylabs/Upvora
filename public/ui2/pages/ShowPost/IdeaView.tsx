import "./idea.css"

import React, { useEffect, useRef, useState } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Comment, InternalNote as Note, Post, PostStatus, Tag, Vote } from "@fider/models"
import { actions, cache, copyToClipboard, Failure, http, navigator } from "@fider/services"
import { useFider } from "@fider/hooks"
import { useAttachments } from "@fider/hooks/useAttachments"
import { VoteButton } from "../../components/VoteButton"
import { StatusPill } from "../../components/StatusPill"
import { ProductChip } from "../../components/ProductChip"
import { Avatar } from "../../components/feedback/Avatar"
import { toast } from "../../components/feedback/toast"
import { Button, Checkbox, Form, TextInput } from "../../components/form"
import { MarkdownEditor } from "../../components/form/MarkdownEditor"
import { Markdown } from "../../components/content/Markdown"
import { IdeaFilesEditor, IdeaFilesList, fileKind, isFileKey } from "../../components/content/IdeaFiles"
import { statusInfo } from "../../lib/status"
import { postHref } from "../../lib/nav"
import { CommentComposer, CommentItem } from "./Comments"
import { DeleteDialog, FeedDialog, ResponseDialog, TranscriptDialog, VotersDialog } from "./Dialogs"
import { InternalNote } from "./InternalNote"
import { canDeleteIdea, canEditIdea, canSeeVoters, canTogglePrivacy, canVote, isStaff, mergeTarget } from "./rules"

// Everything the server sends classic's ShowPost page (app/handlers/post.go, PostDetails).
export interface IdeaData {
  post: Post
  subscribed: boolean
  comments: Comment[]
  tags: Tag[]
  votes: Vote[]
  attachments?: string[]
  internalNote?: Note
}

// The board's overlay has no page props: it loads the same data from the API, as
// classic's overlay does. Votes are capped at 24 like the page.
export const loadIdea = async (num: number, signedIn: boolean): Promise<IdeaData | null> => {
  const [post, comments, tags, votes, sub] = await Promise.all([
    actions.getPost(num),
    actions.getComments(num),
    http.get<Tag[]>("/api/v1/tags"),
    actions.listVotes(num),
    signedIn ? http.get<{ subscribed: boolean }>(`/api/v1/posts/${num}/subscription`).catch(() => null) : Promise.resolve(null),
  ])
  if (!post.ok || !post.data) return null
  return {
    post: post.data,
    comments: comments.ok ? comments.data || [] : [],
    tags: tags.ok ? tags.data || [] : [],
    votes: votes.ok ? (votes.data || []).slice(0, 24) : [],
    subscribed: !!(sub && sub.ok && sub.data?.subscribed),
    attachments: post.data.attachments,
  }
}

const MAX_FACES = 8
const SESSION_TOASTS: [string, () => string][] = [
  ["POST_CREATED_SUCCESS", () => i18n._({ id: "ui2.idea.created", message: "Your idea has been added." })],
  ["POST_CREATED_MODERATION", () => i18n._({ id: "ui2.idea.created.moderation", message: "Your idea is awaiting moderation." })],
  ["COMMENT_CREATED_MODERATION", () => i18n._({ id: "ui2.idea.comment.moderation", message: "Your comment is awaiting moderation." })],
]

const dateOf = (locale: string, d: string | Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(d))

interface IdeaViewProps {
  data: IdeaData
  // Board overlay: rows behind it refresh on close when something changed.
  onDataChanged?: () => void
  titleId?: string
}

export const IdeaView = (props: IdeaViewProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const signedIn = fider.session.isAuthenticated
  const staff = isStaff(fider)
  const locale = fider.currentLocale

  const [post, setPost] = useState(props.data.post)
  const [comments, setComments] = useState<Comment[]>(props.data.comments)
  const [subscribed, setSubscribed] = useState(props.data.subscribed)
  const [votes] = useState<Vote[]>(props.data.votes)
  const [assigned, setAssigned] = useState<string[]>(props.data.post.tags || [])
  const attachmentKeys = props.data.attachments ?? post.attachments ?? []

  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(post.title)
  const [description, setDescription] = useState(post.description)
  const [editError, setEditError] = useState<Failure | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const edit = useAttachments({ maxAttachments: 3 })

  const [respond, setRespond] = useState<{ open: boolean; status?: string; original?: number }>({ open: false })
  const [dialog, setDialog] = useState<"" | "delete" | "voters" | "feed" | "transcript">("")
  const [tagsOpen, setTagsOpen] = useState(false)
  const [brief, setBrief] = useState("")
  const [highlighted, setHighlighted] = useState<number | undefined>(undefined)
  const tagsRef = useRef<HTMLDivElement>(null)

  const changed = () => props.onDataChanged?.()
  const status = statusInfo(tenant, post.status, post.statusKind)
  const statusOf = (slug: string) => statusInfo(tenant, slug)

  const refresh = async () => {
    const [p, c] = await Promise.all([actions.getPost(post.number), actions.getComments(post.number)])
    if (p.ok && p.data) {
      setPost(p.data)
      setAssigned(p.data.tags || [])
    }
    if (c.ok) setComments(c.data || [])
  }

  // Messages left by the share flow or a comment before a reload, as classic shows them.
  useEffect(() => {
    for (const [key, message] of SESSION_TOASTS) {
      if (cache.session.get(key)) {
        cache.session.remove(key)
        toast.success(message())
      }
    }
  }, [])

  // Vora's brief (members only on the server).
  useEffect(() => {
    if (!signedIn) return
    let live = true
    actions.getIdeaBrief(post.number).then((r) => live && r.ok && r.data?.content && setBrief(r.data.content))
    return () => {
      live = false
    }
  }, [post.number])

  // "#comment-12" highlights a comment; "#merge=N" opens the merge dialog for staff.
  const commentIds = comments.map((c) => c.id).join(",")
  useEffect(() => {
    const onHash = () => {
      const hash = location.hash
      const target = mergeTarget(hash)
      if (target !== null) {
        if (staff) setRespond({ open: true, status: PostStatus.Duplicate.value, original: target })
        return
      }
      const m = /^#comment-(\d+)$/.exec(hash)
      if (!m) return setHighlighted(undefined)
      const id = parseInt(m[1], 10)
      if (comments.some((c) => c.id === id)) {
        setHighlighted(id)
      } else {
        setHighlighted(undefined)
        toast.error(i18n._({ id: "ui2.idea.comment.unknown", message: "That comment is not on this idea." }))
      }
    }
    onHash()
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [commentIds])

  const closeRespond = () => {
    setRespond({ open: false })
    // Done with "#merge=N": keep a reload from opening the dialog again.
    if (mergeTarget(location.hash) !== null) history.replaceState(history.state, "", location.pathname + location.search)
  }

  const responded = async () => {
    closeRespond()
    await refresh()
    changed()
  }

  const follow = async () => {
    const r = subscribed ? await actions.unsubscribe(post.number) : await actions.subscribe(post.number)
    if (r.ok) setSubscribed(!subscribed)
  }

  const togglePrivacy = async () => {
    const r = await actions.setPostPrivacy(post.number, !post.isPrivate)
    if (!r.ok) {
      toast.error(i18n._({ id: "showpost.privacy.error", message: "Failed to change privacy." }))
      return
    }
    toast.success(
      post.isPrivate
        ? i18n._({ id: "showpost.privacy.public", message: "This idea is now public." })
        : i18n._({ id: "showpost.privacy.private", message: "This idea is now private. Only its author, collaborators and admins can see it." })
    )
    setPost({ ...post, isPrivate: !post.isPrivate })
    changed()
  }

  const moderate = async (approve: boolean) => {
    const r = approve ? await actions.approvePost(post.id) : await actions.declinePost(post.id)
    if (!r.ok) {
      toast.error(
        approve
          ? i18n._({ id: "showpost.moderation.approveerror", message: "Failed to approve post" })
          : i18n._({ id: "showpost.moderation.declineerror", message: "Failed to decline post" })
      )
      return
    }
    if (approve) {
      toast.success(i18n._({ id: "showpost.moderation.approved", message: "Post approved successfully" }))
      setPost({ ...post, isApproved: true })
      changed()
    } else {
      toast.success(i18n._({ id: "showpost.moderation.declined", message: "Post declined successfully" }))
      navigator.goHome()
    }
  }

  const setProduct = async (productId: number) => {
    const r = await actions.setPostProduct(post.number, productId)
    if (!r.ok) {
      toast.error(i18n._({ id: "ui2.idea.product.failed", message: "Could not change the product. Please try again." }))
      return
    }
    const pr = (tenant.products ?? []).find((p) => p.id === productId)
    setPost({ ...post, product: pr ? { id: pr.id, name: pr.name, slug: pr.slug, color: pr.color } : undefined })
    changed()
  }

  const toggleTag = async (tag: Tag, on: boolean) => {
    const r = on ? await actions.assignTag(tag.slug, post.number) : await actions.unassignTag(tag.slug, post.number)
    if (r.ok) {
      setAssigned((list) => (on ? [...list, tag.slug] : list.filter((s) => s !== tag.slug)))
      changed()
    }
  }

  const openScorecard = async () => {
    const r = await actions.createScorecard({ postId: post.id })
    if (r.ok && r.data) navigator.goTo(`/scorecard/${r.data.id}`)
    else toast.error(i18n._({ id: "ui2.idea.scorecard.failed", message: "Could not open the scorecard for this idea." }))
  }

  const copyLink = () =>
    copyToClipboard(`${location.origin}${postHref(post)}`).then(
      () => toast.success(i18n._({ id: "showpost.copylink.success", message: "Link copied to clipboard" })),
      () => undefined
    )

  const startEdit = () => {
    setTitle(post.title)
    setDescription(post.description)
    edit.setAttachments([])
    setEditError(undefined)
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    const r = await actions.updatePost(post.number, title, description, edit.attachments)
    setSaving(false)
    if (!r.ok) return setEditError(r.error)
    // Files changed: their keys come from the server, so show the saved idea.
    if (edit.attachments.some((a) => (a.remove && isFileKey(a.bkey)) || (!a.remove && fileKind(a.upload?.fileName || "")))) {
      location.reload()
      return
    }
    setEditing(false)
    setPost({ ...post, title, description })
    toast.success(i18n._({ id: "showpost.save.success", message: "Post updated successfully" }))
    changed()
  }

  const tagList = props.data.tags
  const assignedTags = tagList.filter((t) => assigned.includes(t.slug))
  const products = tenant.products ?? []
  const author = post.user.name
  const faces = votes.slice(0, MAX_FACES)
  const moreVoters = Math.max(0, post.votesCount - faces.length)
  const feedURL = `${fider.settings.baseURL}/feed/posts/${post.number}.atom`
  const isAdmin = signedIn && fider.session.user.isAdministrator
  const voted = post.hasVoted

  // Status history: the current status (since its last change, or the response date),
  // the one before it when the server recorded it, and when the idea was posted.
  const since = post.statusChangedAt || (post.status !== PostStatus.Open.value ? post.response?.respondedAt : undefined)
  const prev = post.prevStatus && post.prevStatus !== post.status ? post.prevStatus : undefined

  return (
    <div className="u2-idea">
      <article className="u2-idea__main u2-panel">
        <nav className="u2-idea__crumbs" aria-label={i18n._({ id: "ui2.idea.crumbs", message: "Breadcrumbs" })}>
          <a href="/">
            <Trans id="ui2.idea.allideas">All ideas</Trans>
          </a>
          {post.product && (
            <>
              <span aria-hidden="true">/</span>
              <a href={`/p/${post.product.slug}`}>{post.product.name}</a>
            </>
          )}
          <span aria-hidden="true">/</span>
          <span className="u2-mono">#{post.number}</span>
        </nav>

        {editing ? (
          <Form error={editError} onSubmit={save} className="u2-idea__edit">
            <TextInput stacked name="title" label={<Trans id="ui2.idea.edit.title">Title</Trans>} maxLength={100} value={title} onChange={setTitle} />
            <MarkdownEditor
              field="description"
              label={i18n._({ id: "ui2.idea.edit.description", message: "Description" })}
              initialValue={post.description}
              onChange={setDescription}
              onImageUploaded={edit.handleImageUploaded}
              onGetImageSrc={edit.getImageSrc}
              maxAttachments={3}
              maxImageSizeKB={5 * 1024}
              placeholder={i18n._({
                id: "newpost.modal.description.placeholder",
                message: "Tell us about it. Explain it fully, don't hold back, the more information the better.",
              })}
            />
            {(tenant.fileAttachmentsEnabled || attachmentKeys.some(isFileKey)) && (
              <IdeaFilesEditor
                existing={attachmentKeys}
                attachments={edit.attachments}
                onChange={edit.handleImageUploaded}
                allowAdd={!!tenant.fileAttachmentsEnabled}
              />
            )}
            <div className="u2-row">
              <Button variant="primary" onClick={save} loading={saving} disabled={fider.isReadOnly}>
                <Trans id="action.save">Save</Trans>
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
                <Trans id="action.cancel">Cancel</Trans>
              </Button>
            </div>
          </Form>
        ) : (
          <>
            <h1 id={props.titleId} className="u2-idea__title">
              {post.title}
            </h1>
            <div className="u2-idea__meta">
              <StatusPill status={status} />
              <span className="u2-idea__by">
                <Avatar name={author} src={post.user.avatarURL} size={20} />
                <Trans id="ui2.idea.postedby">Posted by {author}</Trans>
              </span>
              <time dateTime={post.createdAt}>{dateOf(locale, post.createdAt)}</time>
              <span>
                <Plural id="ui2.idea.comments" value={comments.length} one="# comment" other="# comments" />
              </span>
              {post.product && <ProductChip product={post.product} />}
              {post.isPrivate && (
                <span className="u2-chip u2-chip--warn">
                  <Trans id="post.private">Private</Trans>
                </span>
              )}
              {!post.isApproved && (
                <span className="u2-chip u2-chip--warn">
                  <Trans id="post.pending">pending</Trans>
                </span>
              )}
              {signedIn && (
                <button type="button" className="u2-idea__follow" aria-pressed={subscribed} disabled={fider.isReadOnly} onClick={follow}>
                  {subscribed ? <Trans id="label.following">Following</Trans> : <Trans id="label.follow">Follow</Trans>}
                </button>
              )}
            </div>

            {post.isPrivate && (
              <p className="u2-idea__banner">
                <Trans id="ui2.idea.private">Private idea: only its author, collaborators and admins can see it.</Trans>
              </p>
            )}
            {!post.isApproved && signedIn && (
              <div className="u2-idea__banner">
                <Trans id="showpost.moderation.awaiting">Awaiting moderation.</Trans>
                {fider.session.showModerationControls && staff && (
                  <span className="u2-row">
                    <Button small variant="primary" onClick={() => moderate(true)}>
                      <Trans id="action.publish">Publish</Trans>
                    </Button>
                    <Button small variant="danger" onClick={() => moderate(false)}>
                      <Trans id="action.delete">Delete</Trans>
                    </Button>
                  </span>
                )}
              </div>
            )}

            <div className="u2-idea__desc">
              {post.description ? (
                <Markdown text={post.description} />
              ) : (
                <p className="u2-muted">
                  <em>
                    <Trans id="showpost.message.nodescription">No description provided.</Trans>
                  </em>
                </p>
              )}
              <IdeaFilesList bkeys={attachmentKeys} />
            </div>

            {(assignedTags.length > 0 || (staff && tagList.length > 0)) && (
              <div className="u2-idea__tags" ref={tagsRef}>
                {assignedTags.map((t) => (
                  <a key={t.id} className="u2-chip u2-chip--tag" href={`/?tags=${t.slug}`} style={{ "--u-chip-dot": `#${t.color}` } as React.CSSProperties}>
                    {t.name}
                  </a>
                ))}
                {staff && tagList.length > 0 && (
                  <button type="button" className="u2-idea__lnk" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)}>
                    <Trans id="ui2.idea.tags.edit">Edit tags</Trans>
                  </button>
                )}
                {tagsOpen && (
                  <fieldset className="u2-idea__tagpick">
                    <legend className="u2-sr">
                      <Trans id="ui2.idea.tags.legend">Tags on this idea</Trans>
                    </legend>
                    {tagList.map((t) => (
                      <Checkbox key={t.id} checked={assigned.includes(t.slug)} label={t.name} onChange={(on) => toggleTag(t, on)} />
                    ))}
                  </fieldset>
                )}
              </div>
            )}

            <div className="u2-idea__acts">
              <button type="button" className="u2-idea__lnk" onClick={copyLink}>
                <Trans id="action.copylink">Copy link</Trans>
              </button>
              {canEditIdea(fider, post) && (
                <button type="button" className="u2-idea__lnk" onClick={startEdit}>
                  <Trans id="action.edit">Edit</Trans>
                </button>
              )}
              {canTogglePrivacy(fider, post) && (
                <button type="button" className="u2-idea__lnk" onClick={togglePrivacy}>
                  {post.isPrivate ? <Trans id="action.makepublic">Make public</Trans> : <Trans id="action.makeprivate">Make private</Trans>}
                </button>
              )}
              {tenant.isFeedEnabled && (
                <button type="button" className="u2-idea__lnk" onClick={() => setDialog("feed")}>
                  <Trans id="action.commentsfeed">Comment Feed</Trans>
                </button>
              )}
              {canDeleteIdea(fider, post) && (
                <button type="button" className="u2-idea__lnk u2-danger" onClick={() => setDialog("delete")}>
                  <Trans id="action.delete">Delete</Trans>
                </button>
              )}
            </div>
          </>
        )}

        {brief && (
          <section className="u2-idea__brief" aria-labelledby="u2-brief-h">
            <h2 id="u2-brief-h" className="u2-idea__lbl u2-idea__lbl--vora">
              <Trans id="ui2.idea.brief">Vora&apos;s brief</Trans>
            </h2>
            <Markdown text={brief} />
            {isAdmin && (
              <div className="u2-row">
                <button type="button" className="u2-idea__lnk" onClick={() => setDialog("transcript")}>
                  <Trans id="ui2.idea.brief.viewchat">View the conversation</Trans>
                </button>
                <a className="u2-idea__lnk" href={`/_api/posts/${post.number}/brief/download`} download>
                  <Trans id="ui2.idea.brief.download">Download .md</Trans>
                </a>
              </div>
            )}
          </section>
        )}

        <section className="u2-idea__thread" aria-labelledby="u2-thread-h">
          <h2 id="u2-thread-h" className="u2-idea__lbl">
            <Trans id="label.discussion">Discussion</Trans> <span className="u2-mono">{comments.length}</span>
          </h2>
          {post.response && (
            <div className="u2-cm u2-cm--response">
              <Avatar name={post.response.user.name} src={post.response.user.avatarURL} size={32} />
              <div className="u2-cm__body">
                <div className="u2-cm__who">
                  <b>{post.response.user.name}</b>
                  <StatusPill status={status} />
                  <span className="u2-muted">{dateOf(locale, post.response.respondedAt)}</span>
                </div>
                {post.status === PostStatus.Duplicate.value && post.response.original ? (
                  <p>
                    <Trans id="ui2.idea.mergedinto">Merged into</Trans>{" "}
                    <a href={postHref(post.response.original)}>
                      <span className="u2-mono">#{post.response.original.number}</span> {post.response.original.title}
                    </a>
                  </p>
                ) : (
                  <Markdown text={post.response.text} />
                )}
              </div>
            </div>
          )}
          {comments.map((c) => (
            <CommentItem key={c.id} post={post} comment={c} highlighted={highlighted === c.id} onChanged={refresh} />
          ))}
          <CommentComposer
            post={post}
            onPosted={() => {
              refresh()
              changed()
            }}
          />
        </section>
      </article>

      <div className="u2-idea__vote u2-panel">
        <VoteButton
          post={post}
          size="large"
          disabled={!canVote(fider, post)}
          onChange={(_n, v, count) => {
            setPost((p) => ({ ...p, hasVoted: v, votesCount: count }))
            changed()
          }}
        >
          {voted ? <Trans id="ui2.idea.voted">Voted</Trans> : <Trans id="ui2.idea.vote">Vote</Trans>}
        </VoteButton>
        {faces.length > 0 && (
          <div className="u2-idea__faces">
            <span className="u2-faces" role="img" aria-label={faces.map((v) => v.user.name).join(", ")}>
              {faces.map((v) => (
                <img key={v.user.id} src={v.user.avatarURL} alt="" width={22} height={22} loading="lazy" />
              ))}
            </span>
            {moreVoters > 0 && <span className="u2-muted u2-mono">+{moreVoters}</span>}
            {canSeeVoters(fider) && (
              <button type="button" className="u2-idea__lnk" onClick={() => setDialog("voters")}>
                <Trans id="ui2.idea.voters.all">See all voters</Trans>
              </button>
            )}
          </div>
        )}
      </div>

      <aside className="u2-idea__rail u2-panel" aria-label={i18n._({ id: "ui2.idea.rail", message: "About this idea" })}>
        <section>
          <h2 className="u2-idea__lbl">
            <Trans id="ui2.idea.history">Status history</Trans>
          </h2>
          <ol className="u2-idea__timeline">
            <li>
              <span className="u2-mono">{since ? dateOf(locale, since) : dateOf(locale, post.createdAt)}</span>
              <StatusPill status={status} />
            </li>
            {prev && (
              <li>
                <span className="u2-mono">
                  <Trans id="ui2.idea.history.before">before</Trans>
                </span>
                <StatusPill status={statusOf(prev)} />
              </li>
            )}
            {since && (
              <li>
                <span className="u2-mono">{dateOf(locale, post.createdAt)}</span>
                <span className="u2-muted">
                  <Trans id="ui2.idea.history.posted">Posted</Trans>
                </span>
              </li>
            )}
          </ol>
        </section>

        {staff && (
          <section className="u2-idea__staff">
            <h2 className="u2-idea__lbl">
              <Trans id="ui2.idea.staff">Staff</Trans>
            </h2>
            <div className="u2-idea__tools">
              <Button small onClick={() => setRespond({ open: true })} disabled={fider.isReadOnly}>
                <Trans id="action.respond">Update Status</Trans>
              </Button>
              <Button small onClick={() => setRespond({ open: true, status: PostStatus.Duplicate.value })} disabled={fider.isReadOnly}>
                <Trans id="ui2.idea.merge">Merge</Trans>
              </Button>
              {tagList.length > 0 && (
                <Button small onClick={() => setTagsOpen(true)} aria-expanded={tagsOpen}>
                  <Trans id="ui2.idea.tags">Tags</Trans>
                </Button>
              )}
              {tenant.isScorecardEnabled && (
                <Button small onClick={openScorecard}>
                  <Trans id="action.scorecard">Score this idea</Trans>
                </Button>
              )}
            </div>
            {products.length > 0 && (
              <label className="u2-idea__product">
                <span className="u2-idea__lbl">
                  <Trans id="ui2.idea.product">Product</Trans>
                </span>
                <select className="u2-ctl" value={post.product?.id ?? 0} onChange={(e) => setProduct(parseInt(e.target.value, 10) || 0)}>
                  <option value={0}>{i18n._({ id: "ui2.idea.product.general", message: "General" })}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <InternalNote postNumber={post.number} initial={props.data.internalNote} />
          </section>
        )}
      </aside>

      {staff && (
        <ResponseDialog
          post={post}
          open={respond.open}
          initialStatus={respond.status}
          initialOriginal={respond.original}
          onClose={closeRespond}
          onResponded={responded}
        />
      )}
      <DeleteDialog post={post} open={dialog === "delete"} onClose={() => setDialog("")} />
      {canSeeVoters(fider) && <VotersDialog post={post} open={dialog === "voters"} onClose={() => setDialog("")} />}
      {tenant.isFeedEnabled && <FeedDialog url={feedURL} open={dialog === "feed"} onClose={() => setDialog("")} />}
      {isAdmin && <TranscriptDialog postNumber={post.number} open={dialog === "transcript"} onClose={() => setDialog("")} />}
    </div>
  )
}
