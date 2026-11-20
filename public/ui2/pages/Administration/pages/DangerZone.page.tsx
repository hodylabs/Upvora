import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Fider } from "@fider/services"
import { Button, Form, TextInput } from "../../../components/form"
import { Modal, toast } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"

// Danger zone: the owner schedules the site's deletion (one hour grace, an email
// with a cancel link that hits /admin/danger-zone/cancel on the server) after
// typing the subdomain; a scheduled deletion can be cancelled here by the owner.
// The server checks the owner and the subdomain again.

interface DangerZonePageProps {
  isOwner: boolean
  scheduledDeletionAt?: string | null
}

const DangerZonePage = (props: DangerZonePageProps) => {
  const subdomain = Fider.session.tenant.subdomain
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [busy, setBusy] = useState(false)
  const [scheduledAt, setScheduledAt] = useState(props.scheduledDeletionAt)

  const close = () => {
    setOpen(false)
    setConfirmation("")
  }

  const confirmDelete = async () => {
    if (busy || confirmation !== subdomain) return
    setBusy(true)
    const response = await actions.requestTenantDeletion(confirmation)
    setBusy(false)
    if (response.ok) {
      close()
      setScheduledAt(response.data.scheduledDeletionAt)
      toast.success(
        i18n._({ id: "ui2.admin.danger.scheduled", message: "Your site is scheduled for deletion. We've emailed you a link to cancel. You have 1 hour." })
      )
    } else {
      toast.error(i18n._({ id: "ui2.admin.danger.schedulefailed", message: "Failed to schedule deletion. Please try again later." }))
    }
  }

  const cancelDeletion = async () => {
    const response = await actions.cancelTenantDeletion()
    if (response.ok) {
      setScheduledAt(null)
      toast.success(i18n._({ id: "ui2.admin.danger.cancelled", message: "The scheduled deletion has been cancelled." }))
    } else {
      toast.error(i18n._({ id: "ui2.admin.danger.cancelfailed", message: "Failed to cancel the scheduled deletion. Please try again later." }))
    }
  }

  const body = () => {
    if (scheduledAt) {
      const when = new Date(scheduledAt).toLocaleString()
      return (
        <div className="u2-admin__note u2-admin__note--danger" role="status">
          <p>
            <strong>
              <Trans id="ui2.admin.danger.scheduledtitle">This site is scheduled for deletion</Trans>
            </strong>
          </p>
          <p>
            <Trans id="ui2.admin.danger.scheduledwhen">
              Everything for this site will be permanently deleted at <strong>{when}</strong>. This cannot be undone once it runs.
            </Trans>
          </p>
          {props.isOwner ? (
            <Button small variant="danger" onClick={cancelDeletion}>
              <Trans id="ui2.admin.danger.cancel">Cancel deletion</Trans>
            </Button>
          ) : (
            <p className="u2-muted">
              <Trans id="ui2.admin.danger.owneronlycancel">Only the account owner can cancel the deletion.</Trans>
            </p>
          )}
        </div>
      )
    }
    if (!props.isOwner) {
      return (
        <div className="u2-admin__note u2-admin__note--warn">
          <p>
            <strong>
              <Trans id="ui2.admin.danger.deletetitle">Delete this site</Trans>
            </strong>
          </p>
          <p>
            <Trans id="ui2.admin.danger.owneronly">
              Only the account owner (the person who created this site) can delete it. Please contact them if this site needs to be deleted.
            </Trans>
          </p>
        </div>
      )
    }
    return (
      <AdminSection
        title={<Trans id="ui2.admin.danger.deletetitle">Delete this site</Trans>}
        lede={
          <Trans id="ui2.admin.danger.careful">
            Careful! This will permanently delete this site and <strong>everything</strong> in it (all users, posts, comments and votes) and cancels any active
            subscription.
          </Trans>
        }
      >
        <Button variant="danger" onClick={() => setOpen(true)}>
          <Trans id="ui2.admin.danger.open">I understand, delete this site</Trans>
        </Button>
      </AdminSection>
    )
  }

  return (
    <AdminLayout
      name="danger-zone"
      title={<Trans id="ui2.admin.danger.title">Danger Zone</Trans>}
      subtitle={<Trans id="ui2.admin.danger.sub">Permanently delete this site</Trans>}
    >
      {body()}
      <Modal
        open={open}
        onClose={close}
        locked={busy}
        title={<Trans id="ui2.admin.danger.sure">Are you sure you want to delete everything?</Trans>}
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              <Trans id="action.cancel">Cancel</Trans>
            </Button>
            <Button variant="danger-solid" disabled={confirmation !== subdomain} loading={busy} onClick={confirmDelete} data-testid="u2-danger-confirm">
              <Trans id="ui2.admin.danger.yes">Yes, delete this site.</Trans>
            </Button>
          </>
        }
      >
        <p>
          <Trans id="ui2.admin.danger.what">
            This will <strong>permanently delete</strong> this site and everything in it (all users, posts, comments and votes) and cancel any active
            subscription.
          </Trans>
        </p>
        <p>
          <strong>
            <Trans id="ui2.admin.danger.how">How it works</Trans>
          </strong>
        </p>
        <p>
          <Trans id="ui2.admin.danger.howtext">
            We&apos;ll put the delete request in a queue and send an email to confirm what&apos;s happening. After an hour, the delete will be processed and
            everything will be deleted. No going back. No restore from backup. It&apos;s all gone.
          </Trans>
        </p>
        <Form onSubmit={confirmDelete}>
          <TextInput
            name="confirmation"
            stacked
            label={
              <Trans id="ui2.admin.danger.type">
                To confirm, type the subdomain of this site (<strong>{subdomain}</strong>) below:
              </Trans>
            }
            placeholder={subdomain}
            value={confirmation}
            onChange={setConfirmation}
          />
        </Form>
      </Modal>
    </AdminLayout>
  )
}

export default DangerZonePage
