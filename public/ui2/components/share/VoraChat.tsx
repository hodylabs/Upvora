import "./share.css"

import React, { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { AIMessage } from "@fider/models"
import { actions } from "@fider/services"
import { AIFinalizeResponse } from "@fider/services/actions/ai"
import { Markdown } from "../content/Markdown"
import { Button } from "../form/Button"
import { toast } from "../feedback/toast"

export const RETRY_DELAY = 2000

interface VoraChatProps {
  productId: number
  greeting?: string
  messages: AIMessage[]
  onMessages: (messages: AIMessage[]) => void
  input: string
  onInput: (text: string) => void
  onDone: (result: AIFinalizeResponse, transcript: AIMessage[]) => void
  // Send the opening input as the first message, so one Enter in the box starts the talk.
  autoSend?: boolean
}

// The Vora conversation, as classic's VoraChat: a failed turn keeps the person's
// message in the log with a Retry, every turn gets one silent retry first, and the
// server's draft marker ("ready") wraps up on its own. Replies render only through
// the sanitized Markdown component.
export const VoraChat = (props: VoraChatProps) => {
  const { messages } = props
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [finalizing, setFinalizing] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const finalizingRef = useRef(false)
  // The current turn. Leaving the conversation (another product, "Write it yourself",
  // closing the dialog) or starting a newer turn moves it on, so a late answer from an
  // abandoned request never touches the draft.
  const turn = useRef(0)
  useEffect(
    () => () => {
      turn.current++
    },
    [props.productId]
  )

  useEffect(() => {
    logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight })
  }, [messages, busy, failed, finalizing])

  useEffect(() => {
    if (!busy && !finalizing) inputRef.current?.focus()
  }, [busy, finalizing])

  const deliver = async (history: AIMessage[]) => {
    try {
      const res = await actions.aiIdeate(props.productId, history)
      if (res.ok) return res.data
    } catch {
      // A network failure counts the same as a bad answer.
    }
    return null
  }

  const wrapUp = async (history: AIMessage[]) => {
    if (finalizingRef.current || history.length < 2) return
    const id = ++turn.current
    finalizingRef.current = true
    setFinalizing(true)
    const failMessage = i18n._({ id: "ui2.share.vora.wrapfailed", message: "Vora could not draft the idea. Try once more." })
    try {
      const res = await actions.aiFinalize(props.productId, history)
      if (id !== turn.current) return
      if (res.ok) {
        props.onDone(res.data, history)
        return
      }
      toast.error(failMessage)
    } catch {
      if (id === turn.current) toast.error(failMessage)
    } finally {
      finalizingRef.current = false
      setFinalizing(false)
    }
  }

  const run = async (history: AIMessage[]) => {
    const id = ++turn.current
    props.onMessages(history)
    setFailed(false)
    setBusy(true)
    let res = await deliver(history)
    if (res === null && id === turn.current) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY))
      if (id === turn.current) res = await deliver(history)
    }
    if (id !== turn.current) return
    setBusy(false)
    if (res === null) {
      setFailed(true)
      return
    }
    const next: AIMessage[] = [...history, { role: "assistant", content: res.reply }]
    props.onMessages(next)
    if (res.ready) await wrapUp(next)
  }

  const working = busy || finalizing
  const send = () => {
    const text = props.input.trim()
    if (!text || working) return
    props.onInput("")
    run([...messages, { role: "user", content: text }])
  }

  // A ref, not the effect alone: StrictMode runs mount effects twice.
  const autoSent = useRef(false)
  useEffect(() => {
    if (props.autoSend && !autoSent.current && messages.length === 0) {
      autoSent.current = true
      send()
    }
    // Mount only: later input is the person's own typing.
  }, [])

  const composer = (
    <div className="u2-share__composer">
      <label htmlFor="u2-share-composer" className="u2-vh">
        <Trans id="ui2.share.vora.message">Message to Vora</Trans>
      </label>
      <textarea
        id="u2-share-composer"
        ref={inputRef}
        className="u2-ctl"
        rows={2}
        value={props.input}
        disabled={working}
        aria-describedby="u2-share-composer-hint"
        placeholder={
          messages.length === 0
            ? i18n._({ id: "ui2.share.vora.placeholder.first", message: "Describe your idea in a sentence or two" })
            : i18n._({ id: "ui2.share.vora.placeholder", message: "Answer Vora" })
        }
        onChange={(e) => props.onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            send()
          }
        }}
      />
      <span id="u2-share-composer-hint" className="u2-vh">
        <Trans id="ui2.share.vora.keys">Enter sends, Shift+Enter starts a new line.</Trans>
      </span>
      <div className="u2-share__composer-actions">
        {messages.length >= 2 && (
          <Button onClick={() => wrapUp(messages)} disabled={working}>
            <Trans id="ui2.share.vora.wrap">Wrap it up</Trans>
          </Button>
        )}
        <Button variant="primary" onClick={send} disabled={working || !props.input.trim()}>
          <Trans id="ui2.share.vora.send">Send</Trans>
        </Button>
      </div>
    </div>
  )

  return (
    <div className="u2-share__chat">
      <div className="u2-share__log u2-panel" ref={logRef} role="log" aria-live="polite">
        <div className="u2-share__msg u2-share__msg--vora">
          {props.greeting || (
            <Trans id="ui2.share.vora.greeting">Hi, I am Vora. Tell me your rough idea and I will help you turn it into something the team can act on.</Trans>
          )}
        </div>
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <div key={i} className="u2-share__msg u2-share__msg--vora">
              <Markdown text={m.content} />
            </div>
          ) : (
            <div key={i} className="u2-share__msg u2-share__msg--you">
              {m.content}
            </div>
          )
        )}
        {working && (
          <div className="u2-share__typing" role="status">
            <span className="u2-share__dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            {finalizing ? <Trans id="ui2.share.vora.drafting">Vora is drafting your idea</Trans> : <Trans id="ui2.share.vora.writing">Vora is writing</Trans>}
          </div>
        )}
        {failed && !busy && (
          <div className="u2-share__fail" role="alert">
            <Trans id="ui2.share.vora.failed">That did not get through.</Trans>
            <Button small onClick={() => !working && run(messages)}>
              <Trans id="ui2.share.vora.retry">Retry</Trans>
            </Button>
          </div>
        )}
      </div>
      {composer}
    </div>
  )
}
