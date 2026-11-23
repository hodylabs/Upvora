import "./idea.css"

import React, { useEffect, useState } from "react"
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
import { Menu, MenuItem } from "../../components/Menu"
import { StatusInfo, statusInfo } from "../../lib/status"
import { postHref } from "../../lib/nav"
import { CommentComposer, CommentItem } from "./Comments"
import { DeleteDialog, FeedDialog, ResponseDialog, TranscriptDialog, VotersDialog } from "./Dialogs"
import { InternalNote } from "../../components/InternalNote"
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
  ["COMMENT_CREATED_MODERATION", () => i18n._({ id: "ui2.idea.comment.moderation", message: "Your comment is awaiting moderation." })],
]

const dateOf = (locale: string, d: string | Date) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(d))

interface IdeaViewProps {
  data: IdeaData
  // Board overlay: rows behind it refresh on close when something changed.
  onDataChanged?: () => void
  titleId?: string
  // The board's overlay: a close button in the sheet's top bar.
  onClose?: () => void
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
  const feedURL = `${fider.settings.baseURL}/feed/posts/${post.number}.atom`
  const isAdmin = signedIn && fider.session.user.isAdministrator
  const readOnly = fider.isReadOnly
  const events = ideaEvents(post, comments)

  // The rail's former tools, in the top bar's menu (only the ones this viewer may use).
  const tools = [
    canEditIdea(fider, post) && { key: "edit", label: i18n._({ id: "action.edit", message: "Edit" }), onSelect: startEdit },
    staff && !readOnly && { key: "respond", label: i18n._({ id: "action.respond", message: "Update Status" }), onSelect: () => setRespond({ open: true }) },
    staff &&
      !readOnly && {
        key: "merge",
        label: i18n._({ id: "ui2.idea.merge", message: "Merge" }),
        onSelect: () => setRespond({ open: true, status: PostStatus.Duplicate.value }),
      },
    staff &&
      !editing &&
      tagList.length > 0 && { key: "tags", label: i18n._({ id: "ui2.idea.tags.edit", message: "Edit tags" }), onSelect: () => setTagsOpen(true) },
    staff && tenant.isScorecardEnabled && { key: "scorecard", label: i18n._({ id: "action.scorecard", message: "Score this idea" }), onSelect: openScorecard },
    canTogglePrivacy(fider, post) && {
      key: "privacy",
      label: post.isPrivate ? i18n._({ id: "action.makepublic", message: "Make public" }) : i18n._({ id: "action.makeprivate", message: "Make private" }),
      onSelect: togglePrivacy,
    },
    tenant.isFeedEnabled && { key: "feed", label: i18n._({ id: "action.commentsfeed", message: "Comment Feed" }), onSelect: () => setDialog("feed") },
    canDeleteIdea(fider, post) && {
      key: "delete",
      label: <span className="u2-danger">{i18n._({ id: "action.delete", message: "Delete" })}</span>,
      onSelect: () => setDialog("delete"),
    },
  ].filter(Boolean) as MenuItem[]

  return (
    <div className="u2-idea">
      <div className="u2-idea__top">
        {!props.onClose && (
          <a className="u2-iconbtn" href="/" aria-label={i18n._({ id: "ui2.idea.allideas", message: "All ideas" })}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
          </a>
        )}
        <span className="u2-mono">#{post.number}</span>
        <span className="u2-idea__sp" />
        <button
          type="button"
          className="u2-iconbtn"
          onClick={copyLink}
          aria-label={i18n._({ id: "action.copylink", message: "Copy link" })}
          title={i18n._({ id: "action.copylink", message: "Copy link" })}
          data-act="copy"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
          </svg>
        </button>
        {signedIn && (
          <button
            type="button"
            className="u2-iconbtn u2-idea__follow"
            aria-pressed={subscribed}
            disabled={readOnly}
            onClick={follow}
            aria-label={i18n._({ id: "label.follow", message: "Follow" })}
            title={subscribed ? i18n._({ id: "label.following", message: "Following" }) : i18n._({ id: "label.follow", message: "Follow" })}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21h4" />
            </svg>
          </button>
        )}
        <Menu
          items={tools}
          className="u2-menu u2-idea__tools"
          triggerClassName="u2-iconbtn"
          triggerLabel={i18n._({ id: "ui2.idea.tools", message: "More actions" })}
          trigger={
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />
            </svg>
          }
        />
        {props.onClose && <CloseButton onClose={props.onClose} />}
      </div>

      <div className="u2-idea__body">
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
              <Button variant="primary" onClick={save} loading={saving} disabled={readOnly}>
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
            <div className="u2-idea__props">
              <VoteButton
                post={post}
                size="large"
                disabled={!canVote(fider, post)}
                onChange={(_n, v, count) => {
                  setPost((p) => ({ ...p, hasVoted: v, votesCount: count }))
                  changed()
                }}
              />
              {staff && !readOnly ? (
                <button type="button" className="u2-prop" aria-haspopup="dialog" onClick={() => setRespond({ open: true })} data-prop="status">
                  <span className="u2-sr">
                    <Trans id="action.respond">Update Status</Trans>:{" "}
                  </span>
                  <StatusPill status={status} />
                </button>
              ) : (
                <span className="u2-prop" data-prop="status">
                  <StatusPill status={status} />
                </span>
              )}
              {staff && products.length > 0 ? (
                <label className="u2-prop u2-prop--select" data-prop="product">
                  <span className="u2-sr">
                    <Trans id="ui2.idea.product">Product</Trans>
                  </span>
                  <span
                    className="u2-prop__dot"
                    style={post.product?.color ? ({ "--u-chip-dot": post.product.color } as React.CSSProperties) : undefined}
                    aria-hidden="true"
                  />
                  <select value={post.product?.id ?? 0} disabled={readOnly} onChange={(e) => setProduct(parseInt(e.target.value, 10) || 0)}>
                    <option value={0}>{i18n._({ id: "ui2.idea.product.general", message: "General" })}</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                post.product && (
                  <span className="u2-prop" data-prop="product">
                    <ProductChip product={post.product} />
                  </span>
                )
              )}
              {assignedTags.map((t) => (
                <a
                  key={t.id}
                  className="u2-prop u2-prop--tag"
                  href={`/?tags=${t.slug}`}
                  style={{ "--u-chip-dot": `#${t.color}` } as React.CSSProperties}
                  data-prop="tag"
                >
                  {t.name}
                </a>
              ))}
              {staff && tagList.length > 0 && (
                <button type="button" className="u2-prop u2-prop--add" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)} data-prop="tags">
                  <span aria-hidden="true">+</span> <Trans id="ui2.idea.tags">Tags</Trans>
                </button>
              )}
              {post.votesCount > 0 && <Voters faces={faces} count={post.votesCount} onOpen={canSeeVoters(fider) ? () => setDialog("voters") : undefined} />}
              <span className="u2-prop u2-prop--by" data-prop="author">
                <Avatar name={author} src={post.user.avatarURL} size={18} />
                <span>{author}</span>
                <time dateTime={post.createdAt}>{dateOf(locale, post.createdAt)}</time>
              </span>
              {post.isPrivate && (
                <span className="u2-prop u2-prop--warn">
                  <Trans id="post.private">Private</Trans>
                </span>
              )}
              {!post.isApproved && (
                <span className="u2-prop u2-prop--warn">
                  <Trans id="post.pending">pending</Trans>
                </span>
              )}
            </div>
            {tagsOpen && (
              <fieldset className="u2-idea__tagpick">
                <legend className="u2-sr">
                  <Trans id="ui2.idea.tags.legend">Tags on this idea</Trans>
                </legend>
                {tagList.map((t) => (
                  <Checkbox key={t.id} checked={assigned.includes(t.slug)} label={t.name} disabled={readOnly} onChange={(on) => toggleTag(t, on)} />
                ))}
              </fieldset>
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
          </>
        )}

        {brief && (
          <section className="u2-idea__vora" aria-labelledby="u2-brief-h">
            <span className="u2-idea__mark" aria-hidden="true" />
            <div className="u2-idea__vora-body">
              <h2 id="u2-brief-h">
                <Trans id="ui2.idea.brief">Vora&apos;s brief</Trans>
              </h2>
              <Markdown text={brief} />
            </div>
            {isAdmin && (
              <div className="u2-idea__vora-acts">
                <button type="button" className="u2-idea__act" onClick={() => setDialog("transcript")}>
                  <Trans id="ui2.idea.brief.viewchat">View the conversation</Trans>
                </button>
                <a className="u2-idea__act" href={`/_api/posts/${post.number}/brief/download`} download>
                  <Trans id="ui2.idea.brief.download">Download .md</Trans>
                </a>
              </div>
            )}
          </section>
        )}

        {staff && <InternalNote postNumber={post.number} initial={props.data.internalNote} />}

        <section className="u2-idea__thread" aria-labelledby="u2-thread-h">
          <h2 id="u2-thread-h" className="u2-idea__lbl">
            <Trans id="ui2.idea.activity">Activity</Trans>
          </h2>
          <ol className="u2-tl">
            {events.map((ev) =>
              ev.kind === "comment" ? (
                <CommentItem key={`c${ev.comment.id}`} post={post} comment={ev.comment} highlighted={highlighted === ev.comment.id} onChanged={refresh} />
              ) : ev.kind === "shared" ? (
                <li key="shared" className="u2-ev" data-event="shared">
                  <span className="u2-ev__mk" aria-hidden="true">
                    <i />
                  </span>
                  <p className="u2-ev__line">
                    <Trans id="ui2.idea.ev.shared">
                      <b>{author}</b> shared this idea
                    </Trans>
                    <time dateTime={post.createdAt}>{dateOf(locale, post.createdAt)}</time>
                  </p>
                </li>
              ) : (
                <StatusEvent key="status" post={post} at={ev.at} status={status} prev={ev.prev ? statusOf(ev.prev) : undefined} locale={locale} />
              )
            )}
          </ol>
          <CommentComposer
            post={post}
            onPosted={() => {
              refresh()
              changed()
            }}
          />
        </section>
      </div>

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

export const CloseButton = (props: { onClose: () => void }) => (
  <button type="button" className="u2-iconbtn" onClick={props.onClose} aria-label={i18n._({ id: "ui2.ideabrief.close", message: "Close" })}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  </button>
)

// Voter faces and the count; a button to the full list when the viewer may see it.
const Voters = (props: { faces: Vote[]; count: number; onOpen?: () => void }) => {
  const inner = (
    <>
      {props.faces.length > 0 && (
        <span className="u2-faces" aria-hidden="true">
          {props.faces.slice(0, 4).map((v) => (
            <img key={v.user.id} src={v.user.avatarURL} alt="" width={20} height={20} loading="lazy" />
          ))}
        </span>
      )}
      <Plural id="ui2.idea.voters.count" value={props.count} one="# voter" other="# voters" />
    </>
  )
  return props.onOpen ? (
    <button type="button" className="u2-prop" aria-haspopup="dialog" onClick={props.onOpen} data-prop="voters">
      {inner}
    </button>
  ) : (
    <span className="u2-prop" data-prop="voters">
      {inner}
    </span>
  )
}

export type IdeaEvent = { kind: "shared"; at: string } | { kind: "status"; at: string; prev?: string } | { kind: "comment"; at: string; comment: Comment }

// The activity timeline from what the post already carries (no event history exists on
// the server): when it was shared, its latest status change or response, and the comments.
export const ideaEvents = (post: Post, comments: Comment[]): IdeaEvent[] => {
  const list: IdeaEvent[] = [{ kind: "shared", at: post.createdAt }]
  const at = post.statusChangedAt || (post.response ? String(post.response.respondedAt) : undefined)
  if (at && (post.status !== PostStatus.Open.value || post.response)) {
    list.push({ kind: "status", at, prev: post.prevStatus && post.prevStatus !== post.status ? post.prevStatus : undefined })
  }
  for (const c of comments) list.push({ kind: "comment", at: c.createdAt, comment: c })
  const time = (e: IdeaEvent) => new Date(e.at).getTime() || 0
  // Array sort is stable, so "shared" stays first on equal times.
  return list.sort((a, b) => time(a) - time(b))
}

const StatusEvent = (props: { post: Post; at: string; status: StatusInfo; prev?: StatusInfo; locale: string }) => {
  const { post } = props
  const who = post.response?.user?.name || i18n._({ id: "ui2.idea.ev.team", message: "The team" })
  const to = props.status.label
  const from = props.prev?.label || ""
  const original = post.status === PostStatus.Duplicate.value ? post.response?.original : undefined
  const text = original ? "" : post.response?.text
  return (
    <li className="u2-ev" data-event="status" style={{ "--u-ev": `var(--u-s-${props.status.tone})` } as React.CSSProperties}>
      <span className="u2-ev__mk" aria-hidden="true">
        <i />
      </span>
      <div className="u2-ev__main">
        <p className="u2-ev__line">
          {original ? (
            <>
              <Trans id="ui2.idea.ev.merged">
                <b>{who}</b> merged it into
              </Trans>{" "}
              <a href={postHref(original)}>
                <span className="u2-mono">#{original.number}</span> {original.title}
              </a>
            </>
          ) : from ? (
            <Trans id="ui2.idea.ev.moved">
              <b>{who}</b> moved it from {from} to <b>{to}</b>
            </Trans>
          ) : (
            <Trans id="ui2.idea.ev.status">
              <b>{who}</b> set the status to <b>{to}</b>
            </Trans>
          )}
          <time dateTime={props.at}>{dateOf(props.locale, props.at)}</time>
        </p>
        {text && (
          <div className="u2-ev__bubble">
            <Markdown text={text} />
          </div>
        )}
      </div>
    </li>
  )
}
