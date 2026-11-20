import "../components/groupB.css"
import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { Webhook, WebhookData, WebhookStatus, WebhookTriggerResult } from "@fider/models"
import { actions } from "@fider/services"
import { Button } from "../../../components/form"
import { ConfirmDialog, toast } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"
import { WebhookFailInfo, WebhookForm, webhookStatusLabel, webhookTypeLabel } from "../components/webhook"

// Webhooks: classic's list (sorted by name; status, id, type and name per row),
// test (toast, and the failure details on failure), edit, delete with a confirm,
// and add.

interface ManageWebhooksPageProps {
  webhooks: Webhook[]
}

const byName = (a: Webhook, b: Webhook) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

const ManageWebhooksPage = (props: ManageWebhooksPageProps) => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([...(props.webhooks || [])].sort(byName))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Webhook | undefined>()
  const [deleting, setDeleting] = useState<Webhook | undefined>()
  const [failures, setFailures] = useState<{ [id: number]: WebhookTriggerResult }>({})
  const [failInfo, setFailInfo] = useState<number | null>(null)

  const create = async (data: WebhookData) => {
    const result = await actions.createWebhook(data)
    if (!result.ok) return result.error
    const id = result.data.id
    setAdding(false)
    setWebhooks((list) => [...list, { id, ...data }].sort(byName))
  }

  const update = async (data: WebhookData) => {
    if (!editing) return
    const id = editing.id
    const result = await actions.updateWebhook(id, data)
    if (!result.ok) return result.error
    // Saving a failed webhook leaves it disabled until it is turned back on.
    const status = data.status === WebhookStatus.FAILED ? WebhookStatus.DISABLED : data.status
    setWebhooks((list) => list.map((w) => (w.id === id ? { ...w, ...data, status } : w)).sort(byName))
    setEditing(undefined)
  }

  const test = async (w: Webhook) => {
    const result = await actions.testWebhook(w.id)
    if (result.ok && result.data?.success) {
      toast.success(i18n._({ id: "ui2.admin.webhooks.tested", message: "Successfully triggered webhook" }))
      setFailures(({ [w.id]: _, ...rest }) => rest) // eslint-disable-line @typescript-eslint/no-unused-vars
      return
    }
    toast.error(result.data?.message || i18n._({ id: "ui2.admin.webhooks.testfailed", message: "The webhook test failed" }))
    if (result.data) setFailures((f) => ({ ...f, [w.id]: result.data }))
    setWebhooks((list) => list.map((x) => (x.id === w.id ? { ...x, status: WebhookStatus.FAILED } : x)))
  }

  const remove = async () => {
    if (!deleting) return
    const result = await actions.deleteWebhook(deleting.id)
    if (result.ok) setWebhooks((list) => list.filter((w) => w.id !== deleting.id))
    setDeleting(undefined)
  }

  const layout = (content: React.ReactNode) => (
    <AdminLayout
      name="webhooks"
      title={<Trans id="ui2.admin.webhooks.title">Webhooks</Trans>}
      subtitle={<Trans id="ui2.admin.webhooks.sub">Manage your site webhooks</Trans>}
    >
      {content}
    </AdminLayout>
  )

  if (adding) return layout(<WebhookForm onSave={create} onCancel={() => setAdding(false)} />)
  if (editing) return layout(<WebhookForm webhook={editing} onSave={update} onCancel={() => setEditing(undefined)} />)

  const failed = failInfo !== null ? failures[failInfo] : undefined

  return layout(
    <>
      <p>
        <Trans id="ui2.admin.webhooks.intro">
          Use webhooks to integrate Upvora with other applications like Slack, Discord, Zapier and many others.{" "}
          <a href="https://docs.fider.io/using-webhooks" target="_blank" rel="noopener">
            Learn more in our documentation
          </a>
          .
        </Trans>
      </p>
      <AdminSection
        title={<Trans id="ui2.admin.webhooks.mine">My Webhooks</Trans>}
        actions={
          <Button small variant="primary" onClick={() => setAdding(true)}>
            <Trans id="ui2.admin.webhooks.addnew">Add new webhook</Trans>
          </Button>
        }
      >
        <ul className="u2-alist">
          {webhooks.length === 0 && (
            <li className="u2-alist__empty">
              <Trans id="ui2.admin.webhooks.none">There aren&apos;t any webhooks yet.</Trans>
            </li>
          )}
          {webhooks.map((w) => (
            <li key={w.id} data-id={w.id}>
              <span className={`u2-chip u2-wh__state--${w.status}`}>{webhookStatusLabel(w.status)}</span>
              <div className="u2-alist__main">
                <span className="u2-muted">#{w.id}</span> <strong>{webhookTypeLabel(w.type)}</strong> {w.name}
                {failures[w.id] && (
                  <>
                    {" "}
                    <Button small variant="ghost" onClick={() => setFailInfo(w.id)}>
                      <Trans id="ui2.admin.webhooks.faildetails">Failure details</Trans>
                    </Button>
                  </>
                )}
              </div>
              <div className="u2-alist__acts">
                <Button small onClick={() => test(w)}>
                  <Trans id="ui2.admin.webhooks.test">Test</Trans>
                </Button>
                <Button small variant="ghost" onClick={() => setEditing(w)}>
                  <Trans id="action.edit">Edit</Trans>
                </Button>
                <Button small variant="danger" onClick={() => setDeleting(w)}>
                  <Trans id="action.delete">Delete</Trans>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </AdminSection>

      {failed && <WebhookFailInfo result={failed} open={failInfo !== null} onClose={() => setFailInfo(null)} />}

      <ConfirmDialog
        open={!!deleting}
        danger
        title={<Trans id="ui2.admin.webhooks.sure">Are you sure?</Trans>}
        confirmLabel={<Trans id="ui2.admin.webhooks.deletewebhook">Delete webhook</Trans>}
        onCancel={() => setDeleting(undefined)}
        onConfirm={remove}
      >
        {deleting && (
          <Trans id="ui2.admin.webhooks.deletebody">
            The webhook #{deleting.id} &quot;{deleting.name}&quot; will be deleted forever. Alternatively, you may want to <b>disable</b> it instead.
          </Trans>
        )}
      </ConfirmDialog>
    </>
  )
}

export default ManageWebhooksPage
