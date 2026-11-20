import React, { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { AIMessage } from "@fider/models"
import { actions, markdown } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button } from "../../components/form"
import { Modal } from "../../components/feedback"

// "View Idea Brief" for the linked idea, ported from classic's IdeaBriefButton: shown
// only when the idea has a brief. Admins can also read the Vora conversation and
// download the .md (the server fills in the submitter's email only on that route).
export const BriefButton = (props: { postNumber: number }) => {
  const fider = useFider()
  const [content, setContent] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [chat, setChat] = useState<AIMessage[] | null>(null)
  const [showChat, setShowChat] = useState(false)
  const isAdmin = fider.session.isAuthenticated && fider.session.user.isAdministrator

  useEffect(() => {
    if (!fider.session.isAuthenticated) return
    actions.getIdeaBrief(props.postNumber).then((res) => res.ok && res.data?.content && setContent(res.data.content))
  }, [props.postNumber])

  const toggleChat = async () => {
    if (chat === null) {
      const res = await actions.getBriefTranscript(props.postNumber)
      if (!res.ok || !res.data.messages) return
      setChat(res.data.messages)
    }
    setShowChat((v) => !v)
  }

  if (!content) return null

  // The shared Modal handles focus in and out, Esc, the backdrop and the focus trap.
  return (
    <>
      <Button className="u2-sc__brief" onClick={() => setOpen(true)}>
        <Trans id="ui2.ideabrief.view">View Idea Brief</Trans>
      </Button>
      <Modal
        open={open}
        size="lg"
        onClose={() => setOpen(false)}
        title={i18n._({ id: "ui2.ideabrief.title", message: "Idea brief" })}
        footer={
          <>
            {isAdmin && (
              <>
                <Button onClick={toggleChat}>
                  {showChat ? <Trans id="ui2.ideabrief.hidechat">Hide conversation</Trans> : <Trans id="ui2.ideabrief.showchat">View conversation</Trans>}
                </Button>
                <a className="u2-btn" href={`/_api/posts/${props.postNumber}/brief/download`} download>
                  <Trans id="ui2.ideabrief.download">Download .md</Trans>
                </a>
              </>
            )}
            <Button variant="primary" onClick={() => setOpen(false)}>
              <Trans id="ui2.ideabrief.close">Close</Trans>
            </Button>
          </>
        }
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
      </Modal>
    </>
  )
}
