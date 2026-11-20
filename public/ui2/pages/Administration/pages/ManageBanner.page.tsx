import "./groupA.css"

import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure } from "@fider/services"
import { Button, Field, Form, Select, TextArea, Toggle } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { AdminLayout } from "../AdminLayout"

// Site banner: on/off, color variant, message (500 characters), live preview.
// The preview uses the same classes as the shell's banner.

interface ManageBannerPageProps {
  siteBannerEnabled: boolean
  siteBannerMessage: string
  siteBannerVariant: string
}

const MAX_LEN = 500

const variants = () => [
  { value: "info", label: i18n._({ id: "ui2.admin.banner.info", message: "Info: neutral announcement" }) },
  { value: "success", label: i18n._({ id: "ui2.admin.banner.success", message: "Success: green confirmation" }) },
  { value: "warning", label: i18n._({ id: "ui2.admin.banner.warning", message: "Warning: scheduled maintenance" }) },
  { value: "danger", label: i18n._({ id: "ui2.admin.banner.danger", message: "Danger: incident in progress" }) },
  { value: "brand", label: i18n._({ id: "ui2.admin.banner.brand", message: "Brand: tenant primary color" }) },
]

const ManageBannerPage = (props: ManageBannerPageProps) => {
  const [enabled, setEnabled] = useState(props.siteBannerEnabled)
  const [message, setMessage] = useState(props.siteBannerMessage || "")
  const [variant, setVariant] = useState(props.siteBannerVariant || "info")
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)
  const remaining = Math.max(0, MAX_LEN - message.length)

  const save = async () => {
    setBusy(true)
    setError(undefined)
    const result = await actions.updateTenantSiteBanner({ enabled, message, variant })
    setBusy(false)
    if (result.ok) toast.success(i18n._({ id: "ui2.admin.banner.saved", message: "Banner settings saved." }))
    else setError(result.error)
  }

  const enableLabel = i18n._({ id: "ui2.admin.banner.enable", message: "Show site-wide banner" })

  return (
    <AdminLayout
      name="banner"
      title={<Trans id="ui2.admin.banner.title">Site Banner</Trans>}
      subtitle={<Trans id="ui2.admin.banner.sub">Show a site-wide notice above the header for maintenance, releases, or incidents</Trans>}
    >
      <Form error={error} onSubmit={save}>
        {enabled && message.trim() !== "" && (
          <Field label={<Trans id="ui2.admin.banner.preview">Preview</Trans>} group>
            <div className={`u2-banner u2-banner--${variant} u2-bannerprev`}>{message}</div>
          </Field>
        )}
        <Field name="enabled" label={enableLabel} group>
          <Toggle checked={enabled} onChange={setEnabled} label={enableLabel} hideLabel />
        </Field>
        <Select
          name="variant"
          label={<Trans id="ui2.admin.banner.variant">Color variant</Trans>}
          value={variant}
          options={variants()}
          onChange={(v) => setVariant(v || "info")}
        />
        <TextArea
          name="message"
          rows={3}
          label={<Trans id="ui2.admin.banner.message">Message</Trans>}
          value={message}
          onChange={(v) => setMessage(v.slice(0, MAX_LEN))}
          hint={<Trans id="ui2.admin.banner.charsleft">{remaining} characters remaining</Trans>}
        />
        <div className="u2-actions">
          <Button type="submit" variant="primary" loading={busy}>
            <Trans id="ui2.admin.banner.save">Save banner</Trans>
          </Button>
        </div>
      </Form>
    </AdminLayout>
  )
}

export default ManageBannerPage
