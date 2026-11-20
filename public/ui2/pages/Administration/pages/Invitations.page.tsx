import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure, Fider } from "@fider/services"
import { Button, Field, Form, TextArea, TextInput } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { AdminLayout } from "../AdminLayout"

// Invitations: recipients, subject and message (when the copy may be customized),
// a sample to yourself, and the send. Same defaults and rules as classic.

const defaultSubject = () => `[${Fider.session.tenant.name}] We would like to hear from you!`

const defaultMessage = () => `Hi,

We are inviting you to join the ${Fider.session.tenant.name} feedback site, a place where you can vote, discuss and share your ideas and thoughts on how to improve our services!

Click the link below to join!

%invite%

Regards,
${Fider.session.user.name} (${Fider.session.tenant.name})`

// On hosted Upvora, only paid sites may customize the invite copy.
export const canCustomizeCopy = () => !Fider.settings.isBillingEnabled || Fider.session.tenant.isPro

export const parseRecipients = (raw: string): string[] => raw.split(/\n|;|,|\s/gm).filter((x) => !!x)

const InvitationsPage = () => {
  const [subject, setSubject] = useState(defaultSubject)
  const [message, setMessage] = useState(defaultMessage)
  const [raw, setRaw] = useState("")
  const [error, setError] = useState<Failure | undefined>()
  const [sending, setSending] = useState(false)
  const recipients = parseRecipients(raw)
  const email = Fider.session.user.email
  const n = recipients.length

  const sendSample = async () => {
    const result = await actions.sendSampleInvite(subject, message)
    if (result.ok) toast.success(i18n._({ id: "ui2.admin.invite.samplesent", message: "An email message was sent to {email}", values: { email } }))
    setError(result.error)
  }

  const sendInvites = async () => {
    setSending(true)
    const result = await actions.sendInvites(subject, message, recipients)
    setSending(false)
    if (result.ok) {
      toast.success(i18n._({ id: "ui2.admin.invite.sent", message: "Your invites have been sent." }))
      setRaw("")
      setError(undefined)
    } else {
      setError(result.error)
    }
  }

  return (
    <AdminLayout
      name="invitations"
      title={<Trans id="ui2.admin.invite.title">Invitations</Trans>}
      subtitle={<Trans id="ui2.admin.invite.sub">Invite people to share their feedback</Trans>}
    >
      <Form error={error} onSubmit={sendInvites}>
        <TextArea
          name="recipients"
          rows={1}
          label={<Trans id="ui2.admin.invite.to">Send invitations to</Trans>}
          placeholder="james@example.com; mary@example.com"
          value={raw}
          onChange={setRaw}
          hint={
            <Trans id="ui2.admin.invite.tohint">
              Input the list of all email addresses you wish to invite. Separate each address with either <strong>semicolon</strong>, <strong>comma</strong>,{" "}
              <strong>whitespace</strong> or <strong>line break</strong>. You can send this invite to a maximum of 30 recipients each time.
            </Trans>
          }
        />
        {canCustomizeCopy() && (
          <>
            <TextInput
              name="subject"
              label={<Trans id="ui2.admin.invite.subject">Subject</Trans>}
              value={subject}
              maxLength={70}
              onChange={setSubject}
              hint={<Trans id="ui2.admin.invite.subjecthint">This is the subject that will be used on the invitation email. Keep it short and sweet.</Trans>}
            />
            <TextArea
              name="message"
              rows={8}
              label={<Trans id="ui2.admin.invite.message">Message</Trans>}
              value={message}
              onChange={setMessage}
              hint={
                <Trans id="ui2.admin.invite.messagehint">
                  This is the content of the invite. Be polite and explain what this invite is for, otherwise there&apos;s a high change people will ignore your
                  message. You&apos;re allowed to write whatever you want as long as you include the invitation link placeholder named <strong>%invite%</strong>
                  .
                </Trans>
              }
            />
          </>
        )}
        <Field label={<Trans id="ui2.admin.invite.sample">Sample Invite</Trans>} group>
          <div>
            {email ? (
              <Button onClick={sendSample}>
                <Trans id="ui2.admin.invite.samplebtn">Send a sample email to {email}</Trans>
              </Button>
            ) : (
              <Button disabled>
                <Trans id="ui2.admin.invite.noemail">Your profile doesn&apos;t have an email</Trans>
              </Button>
            )}
          </div>
        </Field>
        <Field
          label={<Trans id="ui2.admin.invite.confirm">Confirmation</Trans>}
          hint={<Trans id="ui2.admin.invite.confirmhint">Whenever you&apos;re ready, click the following button to send out these invites.</Trans>}
          group
        >
          <div>
            <Button type="submit" variant="primary" disabled={n === 0} loading={sending}>
              {n === 1 ? <Trans id="ui2.admin.invite.sendone">Send 1 invite</Trans> : <Trans id="ui2.admin.invite.sendmany">Send {n} invites</Trans>}
            </Button>
          </div>
        </Field>
      </Form>
    </AdminLayout>
  )
}

export default InvitationsPage
