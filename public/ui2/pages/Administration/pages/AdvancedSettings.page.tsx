import React, { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { actions, Failure } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button, Form, TextArea } from "../../../components/form"
import { AdminLayout } from "../AdminLayout"

// Advanced: both Custom CSS fields, each labelled with the look it applies to
// (classic's targets classic's markup; the new look has its own, spec Decision),
// and the allowed URL schemes where the server allows them.

interface AdvancedSettingsPageProps {
  customCSS: string
  ui2CustomCSS?: string
  allowedSchemes: string
}

const AdvancedSettingsPage = (props: AdvancedSettingsPageProps) => {
  const fider = useFider()
  const isAdmin = fider.session.user.isAdministrator
  const [customCSS, setCustomCSS] = useState(props.customCSS || "")
  const [ui2CustomCSS, setUI2CustomCSS] = useState(props.ui2CustomCSS || "")
  const [allowedSchemes, setAllowedSchemes] = useState(props.allowedSchemes || "")
  const [error, setError] = useState<Failure | undefined>()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const result = await actions.updateTenantAdvancedSettings(customCSS, allowedSchemes, ui2CustomCSS)
    if (result.ok) {
      location.reload()
      return
    }
    setSaving(false)
    setError(result.error)
  }

  const cssAdvice = (
    <>
      <Trans id="ui2.admin.advanced.cssintro">
        Custom CSS allows you to change the look and feel of your site and apply your own branding. This is a powerful and flexible feature, but requires basic
        understanding of <a href="https://developer.mozilla.org/en-US/docs/Learn/CSS">CSS</a>.
      </Trans>{" "}
      <Trans id="ui2.admin.advanced.cssadvice">
        Custom CSS might break the design of your site as it evolves. Avoid nested selectors, since the HTML structure may change at any time, and keep it
        simple: customize only the essential.
      </Trans>
    </>
  )

  return (
    <AdminLayout
      name="advanced"
      title={<Trans id="ui2.admin.advanced.title">Advanced</Trans>}
      subtitle={<Trans id="ui2.admin.general.sub">Manage your site settings</Trans>}
    >
      <Form error={error} onSubmit={save}>
        <TextArea
          name="ui2CustomCSS"
          label={<Trans id="ui2.admin.advanced.ui2css">Custom CSS for the Upvora look</Trans>}
          hint={
            <>
              <Trans id="ui2.admin.advanced.ui2csshint">Applies only when the site uses the Upvora look. Its classes start with u2-.</Trans> {cssAdvice}
            </>
          }
          rows={10}
          spellCheck={false}
          value={ui2CustomCSS}
          disabled={!isAdmin}
          onChange={setUI2CustomCSS}
        />
        <TextArea
          name="customCSS"
          label={<Trans id="ui2.admin.advanced.classiccss">Custom CSS for the classic look</Trans>}
          hint={<Trans id="ui2.admin.advanced.classiccsshint">Applies only when the site uses the classic look; it targets classic&apos;s markup.</Trans>}
          rows={10}
          spellCheck={false}
          value={customCSS}
          disabled={!isAdmin}
          onChange={setCustomCSS}
        />
        {fider.settings.allowAllowedSchemes && (
          <TextArea
            name="allowedSchemes"
            label={<Trans id="ui2.admin.advanced.schemes">Allowed URL Schemes</Trans>}
            hint={
              <>
                <Trans id="ui2.admin.advanced.schemeshint">
                  By default, uncommon URL schemes are forbidden in links. If you want to allow linking monero or bitcoin addresses, you should add{" "}
                  <code>^monero:[48]</code> or <code>^bitcoin:(1|3|bc1)</code> here.
                </Trans>{" "}
                <Trans id="ui2.admin.advanced.schemesregex">
                  These are regular expressions, one per line, matched against the link address. <code>^javascript</code> is always rejected.
                </Trans>
              </>
            }
            rows={3}
            spellCheck={false}
            value={allowedSchemes}
            disabled={!isAdmin}
            onChange={setAllowedSchemes}
          />
        )}
        {isAdmin && (
          <div className="u2-actions">
            <Button type="submit" variant="primary" loading={saving}>
              <Trans id="action.save">Save</Trans>
            </Button>
          </div>
        )}
      </Form>
    </AdminLayout>
  )
}

export default AdvancedSettingsPage
