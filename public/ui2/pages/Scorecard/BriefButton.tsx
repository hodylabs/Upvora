import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { AIMessage } from "@fider/models"
import { actions, markdown } from "@fider/services"
import { useFider } from "@fider/hooks"

// "View Idea Brief" for the linked idea, ported from classic's IdeaBriefButton: shown
// only when the idea has a brief. Admins can also read the Vora conversation and
// download the .md (the server fills in the submitter's email only on that route).
// TODO(form-primitives): swap the local dialog for the shared one.
export const BriefButton = (props: { postNumber: number }) => {
  const fider = useFider()
  const [content, setContent] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [chat, setChat] = useState<AIMessage[] | null>(null)
  const [showChat, setShowChat] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const isAdmin = fider.session.isAuthenticated && fider.session.user.isAdministrator

  useEffect(() => {
    if (!fider.session.isAuthenticated) return
    actions.getIdeaBrief(props.postNumber).then((res) => res.ok && res.data?.content && setContent(res.data.content))
  }, [props.postNumber])

  useEffect(() => {
    if (open) dialog.current?.focus()
  }, [open])

  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  const toggleChat = async () => {
    if (chat === null) {
      const res = await actions.getBriefTranscript(props.postNumber)
      if (!res.ok || !res.data.messages) return
      setChat(res.data.messages)
    }
    setShowChat((v) => !v)
  }

  if (!content) return null

  return (
    <>
      <button ref={trigger} type="button" className="u2-btn u2-sc__brief" onClick={() => setOpen(true)}>
        <Trans id="ui2.ideabrief.view">View Idea Brief</Trans>
      </button>
      {open && (
        <div className="u2-sc__scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={dialog}
            className="u2-sc__dialog u2-panel"
            role="dialog"
            aria-modal="true"
            aria-label={i18n._({ id: "ui2.ideabrief.title", message: "Idea brief" })}
            tabIndex={-1}
            onKeyDown={(e) => e.key === "Escape" && close()}
          >
            {/* Sanitized by markdown.full, the same path classic's <Markdown> uses. */}
            <div className="u2-sc__md" dangerouslySetInnerHTML={{ __html: markdown.full(content) }} />
            {isAdmin && showChat && chat && (
              <div className="u2-sc__chat">
                <h3>
                  <Trans id="ui2.ideabrief.conversation">Conversation with Vora</Trans>
                </h3>
                {chat.map((m, i) =>
                  m.role === "assistant" ? (
                    <div key={i} className="u2-sc__msg u2-sc__md" dangerouslySetInnerHTML={{ __html: markdown.full(m.content) }} />
                  ) : (
                    <div key={i} className="u2-sc__msg is-user">
                      {m.content}
                    </div>
                  )
                )}
              </div>
            )}
            <div className="u2-sc__dialog-acts">
              {isAdmin && (
                <>
                  <button type="button" className="u2-btn" onClick={toggleChat}>
                    {showChat ? <Trans id="ui2.ideabrief.hidechat">Hide conversation</Trans> : <Trans id="ui2.ideabrief.showchat">View conversation</Trans>}
                  </button>
                  <a className="u2-btn" href={`/_api/posts/${props.postNumber}/brief/download`} download>
                    <Trans id="ui2.ideabrief.download">Download .md</Trans>
                  </a>
                </>
              )}
              <button type="button" className="u2-btn u2-btn--primary" onClick={close}>
                <Trans id="ui2.ideabrief.close">Close</Trans>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
