import "./share.css"

import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { AIMessage, Post, Tag } from "@fider/models"
import { Failure, actions, cache, http, navigator, querystring } from "@fider/services"
import { toText } from "@fider/services/markdown"
import { useFider } from "@fider/hooks"
import { useAttachments } from "@fider/hooks/useAttachments"
import { Modal } from "../feedback/Modal"
import { ConfirmDialog } from "../feedback/ConfirmDialog"
import { Button } from "../form/Button"
import { Form } from "../form/Form"
import { Field } from "../form/Field"
import { TextInput, Select } from "../form/TextInput"
import { Toggle, Checkbox } from "../form/Choice"
import { MarkdownEditor } from "../form/MarkdownEditor"
import { Markdown } from "../content/Markdown"
import { VoteButton } from "../VoteButton"
import { postHref } from "../../lib/nav"
import { VoraChat } from "./VoraChat"
import { IdeaFilesEditor } from "../content/IdeaFiles"
import { CREATED_MODERATION, CREATED_SUCCESS, DRAFT_KEYS, MAX_ATTACHMENTS, fileKind, titleLongEnough, voraGate } from "./rules"

interface ShareDialogProps {
  initialTitle: string
  // The product board it was opened from, if any.
  initialProductId?: number
  onClose: () => void
}

// Classic's SimilarPosts noise words.
const NOISE = ["add", "support", "for", "implement", "create", "make", "allow", "enable", "provide"]
const SIMILAR_DELAY = 1000
let openCount = 0

const draftTags = (all: Tag[]): Tag[] => {
  const slugs = [...(cache.local.get(DRAFT_KEYS.TAGS) || "").split(","), ...querystring.get("tags").split(",")].map((s) => s.trim()).filter(Boolean)
  return all.filter((t) => slugs.includes(t.slug))
}

// "Share an idea": the Vora conversation and, where allowed, the plain form. Every
// rule follows classic's ShareFeedback; the server re-checks all of them on create.
const ShareDialog = (props: ShareDialogProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const user = fider.session.isAuthenticated ? fider.session.user : undefined
  const staff = !!user?.isCollaborator
  const products = tenant.products ?? []

  const [productId, setProductId] = useState<number>(props.initialProductId ?? products[0]?.id ?? 0)
  const gate = voraGate(tenant, user, productId)

  // Vora's output, carried to create exactly as classic does.
  const [brief, setBrief] = useState("")
  const [transcript, setTranscript] = useState<AIMessage[]>([])
  const [voraToken, setVoraToken] = useState("")
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [composer, setComposer] = useState("")

  const template = tenant.descriptionTemplate || ""
  const cachedDescription = cache.local.get(DRAFT_KEYS.DESCRIPTION) || ""
  const prefillTemplate = cachedDescription.trim() === "" && template !== ""
  const cachedTitle = cache.local.get(DRAFT_KEYS.TITLE) || ""
  const [title, setTitle] = useState(props.initialTitle || cachedTitle)
  const [description, setDescription] = useState(prefillTemplate ? template : cachedDescription)
  // The title follows the description's first line until the person edits it.
  const [titleEdited, setTitleEdited] = useState(prefillTemplate || !!props.initialTitle || cachedTitle !== cachedDescription)
  const [editorKey, setEditorKey] = useState("manual")
  const { attachments, handleImageUploaded, getImageSrc, clearAttachments } = useAttachments({
    cacheKey: DRAFT_KEYS.ATTACHMENT,
    useLocalStorage: true,
    maxAttachments: MAX_ATTACHMENTS,
  })
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [isPrivate, setIsPrivate] = useState(false)
  const [similar, setSimilar] = useState<Post[]>([])
  const [error, setError] = useState<Failure>()
  const [submitting, setSubmitting] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const firstRender = useRef(true)

  // Start with Vora where it serves this product, with the bar's text ready to send.
  const [mode, setMode] = useState<"vora" | "form">(gate.available ? "vora" : "form")
  useEffect(() => {
    if (gate.available && mode === "vora" && props.initialTitle) setComposer(props.initialTitle)
  }, [])

  const showForm = !gate.required || !!brief
  const inVora = gate.available && !brief && (mode === "vora" || !showForm)
  const canEditTags = fider.settings.postWithTags && allTags.length > 0
  const canMakePrivate = staff || (!!user && tenant.membersPrivateIdeas)
  const canAttachFiles = !!user && !!tenant.fileAttachmentsEnabled
  const agent = tenant.aiAgents?.find((a) => a.productId === productId) ?? tenant.aiAgents?.find((a) => a.productId === null)

  useEffect(() => {
    if (!fider.settings.postWithTags) return
    http.get<Tag[]>("/api/v1/tags").then((res) => {
      if (!res.ok) return
      setAllTags(res.data || [])
      setTags(draftTags(res.data || []))
    })
  }, [])

  const changeTitle = (value: string, manual = true) => {
    setTitle(value)
    cache.local.set(DRAFT_KEYS.TITLE, value)
    if (manual) setTitleEdited(true)
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (titleEdited || description.startsWith("![](fider-image:attachments")) return
    const cut = description.indexOf("\n")
    changeTitle(toText(description.substring(0, cut === -1 ? 80 : Math.min(cut, 80))), false)
  }, [description, titleEdited])

  // Similar ideas while the title is typed, through the board's lookup.
  useEffect(() => {
    const q = title
      .split(" ")
      .filter((w) => !NOISE.includes(w))
      .join(" ")
    if (!showForm || q.trim().length < 2) {
      setSimilar([])
      return
    }
    let live = true
    const timer = window.setTimeout(() => {
      actions
        .findSimilarPosts(q)
        .then((res) => live && res.ok && setSimilar(res.data || []))
        .catch(() => undefined)
    }, SIMILAR_DELAY)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [title, showForm])

  const changeDescription = (value: string) => {
    // An emptied description leaves the cache, so the template comes back next time.
    if (value.trim() === "") cache.local.remove(DRAFT_KEYS.DESCRIPTION)
    else cache.local.set(DRAFT_KEYS.DESCRIPTION, value)
    setDescription(value)
  }

  const changeTags = (tag: Tag, on: boolean) => {
    const next = on ? [...tags, tag] : tags.filter((t) => t.slug !== tag.slug)
    cache.local.set(DRAFT_KEYS.TAGS, next.map((t) => t.slug).join(","))
    setTags(next)
  }

  const clearDraft = () => {
    cache.local.remove(...Object.values(DRAFT_KEYS))
    clearAttachments()
  }

  const voraDone = (res: { title: string; description: string; brief: string; tags?: string[]; voraToken?: string }, history: AIMessage[]) => {
    setVoraToken(res.voraToken ?? "")
    changeTitle(res.title)
    changeDescription(res.description)
    setEditorKey("vora")
    setBrief(res.brief)
    setTranscript(history)
    if (canEditTags && res.tags && res.tags.length > 0) setTags(allTags.filter((t) => res.tags?.includes(t.slug)))
    setMode("form")
  }

  const submit = async () => {
    if (!titleLongEnough(title) || submitting) return
    setSubmitting(true)
    const result = await actions.createPost(
      title,
      description,
      attachments,
      tags.map((t) => t.slug),
      productId,
      brief,
      transcript,
      isPrivate,
      voraToken
    )
    if (result.ok) {
      setError(undefined)
      clearDraft()
      cache.session.set(result.data.isApproved ? CREATED_SUCCESS : CREATED_MODERATION, "true")
      navigator.goTo(postHref(result.data))
      return
    }
    setSubmitting(false)
    if (result.error) setError(result.error)
  }

  const dirty =
    messages.length > 0 ||
    composer.trim() !== "" ||
    !!brief ||
    title.trim() !== "" ||
    (description.trim() !== "" && description !== template) ||
    attachments.some((a) => !a.remove)

  const requestClose = () => {
    if (confirmClose) return
    if (dirty && !submitting) setConfirmClose(true)
    else if (!submitting) props.onClose()
  }

  // The browser's Back button closes the dialog, as in classic. The count keeps a
  // StrictMode remount from stepping back out of the entry it just pushed.
  useEffect(() => {
    openCount++
    if (!history.state?.u2share) history.pushState({ u2share: true }, "", location.href)
    const onPop = () => props.onClose()
    window.addEventListener("popstate", onPop)
    return () => {
      openCount--
      window.removeEventListener("popstate", onPop)
      window.setTimeout(() => {
        if (openCount === 0 && history.state?.u2share) history.back()
      }, 0)
    }
  }, [])

  const fileCount = attachments.filter((a) => !a.remove && a.upload && fileKind(a.upload.fileName || "")).length
  const submitLabel = <Trans id="newpost.modal.submit">Submit your idea</Trans>

  return (
    <>
      <Modal
        open={true}
        size="full"
        locked={submitting}
        onClose={requestClose}
        title={<Trans id="ui2.vora.share">Share an idea</Trans>}
        footer={
          inVora ? undefined : (
            <>
              <Button variant="ghost" onClick={requestClose} disabled={submitting}>
                <Trans id="action.cancel">Cancel</Trans>
              </Button>
              <Button variant="primary" onClick={submit} loading={submitting} disabled={!titleLongEnough(title)}>
                {submitLabel}
              </Button>
            </>
          )
        }
      >
        <div className={inVora ? "u2-share u2-share--vora" : "u2-share"}>
          {tenant.shareIdeaInstructions && (
            <div className="u2-share__instructions u2-panel">
              <Markdown text={tenant.shareIdeaInstructions} />
            </div>
          )}

          {products.length > 0 && (
            <div className="u2-share__product">
              <Select
                name="productId"
                label={i18n._({ id: "newpost.modal.product.label", message: "Product" })}
                value={String(productId)}
                // Vora talks to the chosen product's agent: pick it before the conversation.
                disabled={inVora && messages.length > 0}
                options={products.map((p) => ({ value: String(p.id), label: p.name }))}
                onChange={(v) => setProductId(parseInt(v, 10) || 0)}
              />
            </div>
          )}

          {gate.available && !brief && showForm && (
            <div className="u2-share__modes" role="group" aria-label={i18n._({ id: "ui2.share.mode", message: "How to share" })}>
              <button type="button" className="u2-share__mode" aria-pressed={mode === "vora"} onClick={() => setMode("vora")}>
                <Trans id="ui2.share.mode.vora">Talk it through with Vora</Trans>
              </button>
              <button type="button" className="u2-share__mode" aria-pressed={mode === "form"} onClick={() => setMode("form")}>
                <Trans id="ui2.share.mode.form">Write it yourself</Trans>
              </button>
            </div>
          )}

          {inVora && (
            <>
              <p className="u2-share__lead u2-muted">
                {gate.required ? (
                  <Trans id="ui2.share.vora.required">
                    New ideas on this board start with Vora: it interviews you and drafts the whole idea, which you then review.
                  </Trans>
                ) : (
                  <Trans id="ui2.share.vora.optional">
                    Not sure how to phrase it? Vora interviews you and drafts the whole idea. You review everything before it posts.
                  </Trans>
                )}
              </p>
              <VoraChat
                productId={productId}
                greeting={agent?.description}
                messages={messages}
                onMessages={setMessages}
                input={composer}
                onInput={setComposer}
                onDone={voraDone}
              />
            </>
          )}

          {!inVora && showForm && (
            <Form error={error} onSubmit={submit} className="u2-share__form">
              {brief && (
                <details className="u2-share__brief u2-panel">
                  <summary>
                    <Trans id="ui2.share.brief.attached">Idea brief attached. Review the title and description, edit anything, then submit.</Trans>
                  </summary>
                  <Markdown text={brief} />
                </details>
              )}
              <TextInput
                stacked
                name="title"
                maxLength={255}
                label={i18n._({ id: "newpost.modal.title.label", message: "Give your idea a title" })}
                placeholder={i18n._({ id: "newpost.modal.title.placeholder", message: "Something short and snappy, sum it up in a few words" })}
                value={title}
                disabled={fider.isReadOnly}
                onChange={(v) => changeTitle(v)}
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
              {similar.length > 0 && (
                <section className="u2-share__similar" aria-live="polite">
                  <p className="u2-muted">{i18n._({ id: "home.similar.title", message: "We have similar posts, is your idea already on the list?" })}</p>
                  <ul>
                    {similar.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        <VoteButton post={p} />
                        <a href={postHref(p)}>{p.title}</a>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <Field stacked group label={i18n._({ id: "ui2.share.description", message: "Description" })}>
                <MarkdownEditor
                  key={editorKey}
                  field="description"
                  label={i18n._({ id: "ui2.share.description", message: "Description" })}
                  initialValue={description}
                  onChange={changeDescription}
                  disabled={fider.isReadOnly}
                  maxAttachments={MAX_ATTACHMENTS - fileCount}
                  maxImageSizeKB={5 * 1024}
                  placeholder={i18n._({
                    id: "newpost.modal.description.placeholder",
                    message: "Tell us about it. Explain it fully, don't hold back, the more information the better.",
                  })}
                  onImageUploaded={handleImageUploaded}
                  onGetImageSrc={getImageSrc}
                />
              </Field>
              {canAttachFiles && (
                <Field stacked group label={<Trans id="ideafiles.label">Files</Trans>}>
                  <IdeaFilesEditor attachments={attachments} onChange={handleImageUploaded} disabled={fider.isReadOnly} />
                </Field>
              )}
              {canEditTags && (
                <Field stacked group label={<Trans id="label.tags">Tags</Trans>}>
                  <div className="u2-share__tags">
                    {allTags.map((t) => (
                      <Checkbox key={t.slug} label={t.name} checked={tags.some((x) => x.slug === t.slug)} onChange={(on) => changeTags(t, on)} />
                    ))}
                  </div>
                </Field>
              )}
              {canMakePrivate && (
                <Field
                  stacked
                  group
                  label={<Trans id="newpost.modal.private.label">Make private</Trans>}
                  hint={
                    staff ? (
                      <Trans id="newpost.modal.private.hint">Only collaborators and admins can see this idea.</Trans>
                    ) : (
                      <Trans id="newpost.modal.private.hint.member">Only you, collaborators and admins can see this idea.</Trans>
                    )
                  }
                >
                  <Toggle checked={isPrivate} onChange={setIsPrivate} hideLabel label={<Trans id="newpost.modal.private.label">Make private</Trans>} />
                </Field>
              )}
            </Form>
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmClose}
        danger
        title={<Trans id="ui2.share.discard.title">Discard this idea?</Trans>}
        confirmLabel={<Trans id="ui2.share.discard.confirm">Discard</Trans>}
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          clearDraft()
          props.onClose()
        }}
      >
        <p>
          <Trans id="ui2.share.discard.text">What you wrote and your conversation with Vora will be lost.</Trans>
        </p>
      </ConfirmDialog>
    </>
  )
}

export default ShareDialog
