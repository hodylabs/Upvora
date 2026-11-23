import "./moderation.css"

import React, { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { User, UserStatus } from "@fider/models"
import { Result, actions, chopString, formatDate, http, markdown, notify, timeSince } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button } from "../../../components/form"
import { ConfirmDialog } from "../../../components/feedback"
import { AdminLayout } from "../AdminLayout"

// The moderation queue (paid plan only). The route is behind RequirePro (proUi) and its
// data and actions behind RequirePro too (proAdmin, proAdminApi), exactly as classic;
// the server decides, this page only renders what it is given.
export interface ModerationItem {
  type: "post" | "comment"
  id: number
  postId?: number
  postNumber?: number
  postSlug?: string
  title?: string
  content: string
  user: User
  createdAt: string
  postTitle?: string
}

type Verb = "approve" | "decline" | "approveVerify" | "declineBlock"

const run = (item: ModerationItem, verb: Verb): Promise<Result> => {
  const post = item.type === "post"
  switch (verb) {
    case "approve":
      return post ? actions.approvePost(item.id) : actions.approveComment(item.id)
    case "decline":
      return post ? actions.declinePost(item.id) : actions.declineComment(item.id)
    case "approveVerify":
      return post ? actions.approvePostAndVerify(item.id) : actions.approveCommentAndVerify(item.id)
    case "declineBlock":
      return post ? actions.declinePostAndBlock(item.id) : actions.declineCommentAndBlock(item.id)
  }
}

// Same toast text (and ids) as classic, per verb and item type.
const message = (type: ModerationItem["type"], verb: Verb, ok: boolean): string => {
  const m = {
    post: {
      approve: [
        { id: "moderation.post.published", message: "Post published successfully" },
        { id: "moderation.post.publish.error", message: "Failed to publish post" },
      ],
      decline: [
        { id: "moderation.post.deleted", message: "Post deleted successfully" },
        { id: "moderation.post.delete.error", message: "Failed to delete post" },
      ],
      approveVerify: [
        { id: "moderation.post.published.verified", message: "Post published and user verified" },
        { id: "moderation.post.publish.verify.error", message: "Failed to publish post and verify user" },
      ],
      declineBlock: [
        { id: "moderation.post.deleted.blocked", message: "Post deleted and user blocked" },
        { id: "moderation.post.delete.block.error", message: "Failed to delete post and block user" },
      ],
    },
    comment: {
      approve: [
        { id: "moderation.comment.published", message: "Comment published successfully" },
        { id: "moderation.comment.publish.error", message: "Failed to publish comment" },
      ],
      decline: [
        { id: "moderation.comment.deleted", message: "Comment deleted successfully" },
        { id: "moderation.comment.delete.error", message: "Failed to delete comment" },
      ],
      approveVerify: [
        { id: "moderation.comment.published.verified", message: "Comment published and user verified" },
        { id: "moderation.comment.publish.verify.error", message: "Failed to publish comment and verify user" },
      ],
      declineBlock: [
        { id: "moderation.comment.deleted.blocked", message: "Comment deleted and user blocked" },
        { id: "moderation.comment.delete.block.error", message: "Failed to delete comment and block user" },
      ],
    },
  }[type][verb][ok ? 0 : 1]
  return i18n._(m)
}

const linkOf = (item: ModerationItem) => `/posts/${item.postNumber}/${item.postSlug}${item.type === "comment" ? `#comment-${item.id}` : ""}`

const Item = (props: { item: ModerationItem; locale: string; busy: boolean; onAct: (item: ModerationItem, verb: Verb) => void }) => {
  const { item } = props
  const blocked = item.user.status === UserStatus.Blocked
  const title = item.type === "post" ? item.title : item.postTitle
  const excerpt = markdown.toText(chopString(item.content, 200))
  return (
    <li className="u2-mod__item" data-kind={item.type} data-id={item.id}>
      <img className="u2-mod__avatar" src={item.user.avatarURL} alt="" width={32} height={32} />
      <div className="u2-mod__body">
        <div className="u2-mod__who">
          <strong>{item.user.name}</strong>
          {item.user.email && <span className="u2-muted">&lt;{item.user.email}&gt;</span>}
          {blocked && (
            <span className="u2-chip u2-danger">
              <Trans id="ui2.moderation.blocked">blocked</Trans>
            </span>
          )}
          <time className="u2-mod__time u2-muted" dateTime={item.createdAt} title={formatDate(props.locale, item.createdAt)}>
            {timeSince(props.locale, new Date(), new Date(item.createdAt))}
          </time>
        </div>
        <a className="u2-mod__link" href={linkOf(item)}>
          {item.type === "post" ? <strong>{title}</strong> : <span>{excerpt}</span>}
        </a>
        {item.type === "post" ? <p className="u2-mod__text">{excerpt}</p> : <p className="u2-mod__on u2-muted">{title}</p>}
        <div className="u2-mod__acts">
          <Button variant="primary" disabled={props.busy} onClick={() => props.onAct(item, "approve")} data-verb="approve">
            <Trans id="action.publish">Publish</Trans>
          </Button>
          <Button disabled={props.busy} onClick={() => props.onAct(item, "decline")} data-verb="decline">
            <Trans id="action.delete">Delete</Trans>
          </Button>
          <Button disabled={props.busy} onClick={() => props.onAct(item, "approveVerify")} data-verb="approveVerify">
            <Trans id="action.publish.verify">Publish & Trust</Trans>
          </Button>
          <Button variant="danger" disabled={props.busy} onClick={() => props.onAct(item, "declineBlock")} data-verb="declineBlock">
            <Trans id="action.delete.block">Delete & Block</Trans>
          </Button>
        </div>
      </div>
    </li>
  )
}

const ContentModerationPage = () => {
  const fider = useFider()
  const [items, setItems] = useState<ModerationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [blocking, setBlocking] = useState<ModerationItem | null>(null)

  useEffect(() => {
    const failed = () => notify.error(i18n._({ id: "moderation.fetch.error", message: "Failed to fetch moderation items" }))
    http
      .get<{ items: ModerationItem[] }>("/_api/admin/moderation/items")
      .then((res) => (res.ok ? setItems(res.data?.items || []) : failed()))
      .catch(failed)
      .finally(() => setLoading(false))
  }, [])

  const act = async (item: ModerationItem, verb: Verb) => {
    // Blocking a person is the one action that reaches past this item: confirm it first.
    if (verb === "declineBlock" && blocking !== item) return setBlocking(item)
    const key = `${item.type}-${item.id}`
    setBusy(key)
    const res = await run(item, verb).catch(() => ({ ok: false }) as Result)
    setBusy(null)
    notify[res.ok ? "success" : "error"](message(item.type, verb, res.ok))
    if (res.ok) setItems((list) => list.filter((i) => !(i.type === item.type && i.id === item.id)))
  }

  const posts = items.filter((i) => i.type === "post")
  const comments = items.filter((i) => i.type === "comment")

  const section = (kind: "post" | "comment", list: ModerationItem[]) =>
    list.length > 0 && (
      <section className="u2-panel u2-mod__section" aria-labelledby={`u2-mod-${kind}`}>
        <h2 id={`u2-mod-${kind}`} className="u2-mod__h">
          {kind === "post" ? <Trans id="ui2.moderation.ideas">New ideas</Trans> : <Trans id="ui2.moderation.comments">New comments</Trans>}{" "}
          <span className="u2-mono u2-muted">{list.length}</span>
        </h2>
        <ul className="u2-mod__list">
          {list.map((i) => (
            <Item key={`${i.type}-${i.id}`} item={i} locale={fider.currentLocale} busy={busy === `${i.type}-${i.id}`} onAct={act} />
          ))}
        </ul>
      </section>
    )

  return (
    <AdminLayout
      name="moderation"
      title={<Trans id="moderation.title">Moderation Queue</Trans>}
      subtitle={
        <Trans id="moderation.subtitle">These ideas and comments are from people outside of your trusted users list, you decide if they get published.</Trans>
      }
      wide
    >
      <div className="u2-mod">
        {loading ? (
          <div className="u2-loading" aria-busy="true" />
        ) : items.length === 0 ? (
          <p className="u2-panel u2-mod__empty">
            <Trans id="moderation.empty">All content has been moderated. You&apos;re all caught up!</Trans>
          </p>
        ) : (
          <>
            {section("post", posts)}
            {section("comment", comments)}
          </>
        )}
      </div>
      <ConfirmDialog
        open={!!blocking}
        danger
        title={
          blocking?.type === "comment" ? (
            <Trans id="ui2.moderation.blockcomment.title">Delete this comment and block its author?</Trans>
          ) : (
            <Trans id="ui2.moderation.blockpost.title">Delete this idea and block its author?</Trans>
          )
        }
        confirmLabel={<Trans id="action.delete.block">Delete & Block</Trans>}
        onCancel={() => setBlocking(null)}
        onConfirm={async () => {
          if (blocking) await act(blocking, "declineBlock")
          setBlocking(null)
        }}
      >
        {blocking &&
          i18n._({
            id: "ui2.moderation.block.text",
            message: "{name} will be blocked and can no longer sign in or take part until an administrator unblocks them.",
            values: { name: blocking.user.name },
          })}
      </ConfirmDialog>
    </AdminLayout>
  )
}

export default ContentModerationPage
