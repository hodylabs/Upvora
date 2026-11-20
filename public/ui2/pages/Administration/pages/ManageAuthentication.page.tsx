import "./groupA.css"

import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { OAuthConfig, OAuthProviderOption } from "@fider/models"
import { actions, Failure, Fider, uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button, Field, Form, Toggle } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { systemProviderLogos } from "../../../components/account/providerLogos"
import { AdminLayout, AdminSection } from "../AdminLayout"
import { OAuthForm } from "./OAuthForm"

// Authentication: email sign-in switch, the OAuth providers list (system providers
// switch on and off; custom ones edit and test) and the add/edit editor. Same rules
// as classic: email sign-in can only be turned off once another provider is on, and
// the last enabled provider cannot be turned off while email sign-in is off.

interface ManageAuthenticationPageProps {
  providers: OAuthProviderOption[]
}

const ManageAuthenticationPage = (props: ManageAuthenticationPageProps) => {
  const fider = useFider()
  const isAdmin = fider.session.user.isAdministrator
  const [providers, setProviders] = useState(props.providers)
  const [isAdding, setAdding] = useState(false)
  const [editing, setEditing] = useState<OAuthConfig | undefined>()
  const [emailAuth, setEmailAuth] = useState(fider.session.tenant.isEmailAuthAllowed)
  const [error, setError] = useState<Failure | undefined>()
  // Classic computes this once, from the providers the page loaded with.
  const [canDisableEmailAuth] = useState(props.providers.some((o) => o.isEnabled))

  const enabledCount = providers.filter((o) => o.isEnabled).length
  const cantDisable = !emailAuth && enabledCount == 1

  const toggleEmailAuth = async (active: boolean) => {
    setEmailAuth(active)
    const response = await actions.updateTenantEmailAuthAllowed(active)
    if (response.ok) {
      toast.success(i18n._({ id: "ui2.admin.auth.emailsaved", message: "You successfully changed email authentication setting." }))
    } else {
      setEmailAuth(!active)
      setError(response.error)
      toast.error(i18n._({ id: "ui2.admin.auth.emailfailed", message: "Unable to save this setting." }))
    }
  }

  const toggleSystemProvider = async (provider: OAuthProviderOption, active: boolean) => {
    const response = await actions.setSystemProviderStatus(provider.provider, active)
    if (response.ok) {
      setProviders((list) => list.map((o) => (o.provider === provider.provider ? { ...o, isEnabled: active } : o)))
    }
  }

  const edit = async (provider: string) => {
    const result = await actions.getOAuthConfig(provider)
    if (result.ok) {
      setEditing(result.data)
      setAdding(false)
    } else {
      toast.error(i18n._({ id: "ui2.admin.auth.loadfailed", message: "Failed to retrieve OAuth configuration. Try again later" }))
    }
  }

  const startTest = (provider: string) => {
    const redirect = `${Fider.settings.baseURL}/oauth/${provider}/echo`
    window.open(`/oauth/${provider}?redirect=${redirect}`, "oauth-test", "width=1100,height=600,status=no,menubar=no")
  }

  const cancel = () => {
    setAdding(false)
    setEditing(undefined)
  }

  const logo = (o: OAuthProviderOption) => (o.logoBlobKey ? uploadedImageURL(o.logoBlobKey, 100) : systemProviderLogos[o.provider])
  const emailLabel = i18n._({ id: "ui2.admin.auth.allowemail", message: "Allow Email Authentication" })

  return (
    <AdminLayout
      name="authentication"
      title={<Trans id="ui2.admin.auth.title">Authentication</Trans>}
      subtitle={<Trans id="ui2.admin.auth.sub">Manage your site authentication</Trans>}
    >
      {isAdding || editing ? (
        <OAuthForm key={editing?.provider || "new"} config={editing} cantDisable={cantDisable} onCancel={cancel} />
      ) : (
        <>
          <AdminSection title={<Trans id="ui2.admin.auth.general">General Authentication</Trans>}>
            <Form error={error}>
              <Field
                name="isEmailAuthAllowed"
                group
                label={emailLabel}
                hint={
                  <>
                    {!canDisableEmailAuth && (
                      <>
                        <Trans id="ui2.admin.auth.needprovider">
                          You need to configure another authentication provider before disabling email authentication.
                        </Trans>{" "}
                      </>
                    )}
                    <Trans id="ui2.admin.auth.emailhint">
                      When email-based authentication is disabled, users will not be allowed to sign in using their email. Thus, they will be forced to use
                      another authentication provider, such as your preferred OAuth provider.
                    </Trans>{" "}
                    <Trans id="ui2.admin.auth.emailadmins">Note: Administrator accounts will still be allowed to sign in using their email.</Trans>
                  </>
                }
              >
                <Toggle checked={emailAuth} label={emailLabel} hideLabel disabled={!isAdmin || !canDisableEmailAuth} onChange={toggleEmailAuth} />
              </Field>
            </Form>
          </AdminSection>

          <AdminSection
            title={<Trans id="ui2.admin.auth.providers">OAuth Providers</Trans>}
            lede={
              <Trans id="ui2.admin.auth.providershint">
                You can use these section to add any authentication provider thats supports the OAuth2 protocol. Additional information is available in our{" "}
                <a rel="noopener" target="_blank" href="https://docs.fider.io/configuring-oauth">
                  OAuth Documentation
                </a>
                .
              </Trans>
            }
            actions={
              isAdmin && (
                <Button small onClick={() => setAdding(true)}>
                  <Trans id="ui2.admin.auth.addnew">Add new</Trans>
                </Button>
              )
            }
          >
            <ul className="u2-alist">
              {providers.map((o) => {
                const src = logo(o)
                return (
                  <li key={o.provider} data-provider={o.provider}>
                    {src ? <img className="u2-oauth__logo" src={src} alt="" width={20} height={20} /> : <span className="u2-oauth__logo" />}
                    <div className="u2-alist__main">
                      <strong>{o.displayName}</strong>
                      {o.isCustomProvider && (
                        <div className="u2-alist__meta">
                          <span className={o.isEnabled ? "u2-oauth__on" : "u2-oauth__off"}>
                            {o.isEnabled ? <Trans id="ui2.admin.auth.enabled">Enabled</Trans> : <Trans id="ui2.admin.auth.disabled">Disabled</Trans>}
                          </span>
                          <div>
                            <strong>
                              <Trans id="ui2.admin.auth.clientid">Client ID:</Trans>
                            </strong>{" "}
                            {o.clientID}
                          </div>
                          <div>
                            <strong>
                              <Trans id="ui2.admin.auth.callback">Callback URL:</Trans>
                            </strong>{" "}
                            <span className="u2-mono">{o.callbackURL}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="u2-alist__acts">
                      {o.isCustomProvider && isAdmin && (
                        <>
                          <Button small onClick={() => edit(o.provider)}>
                            <Trans id="ui2.admin.auth.edit">Edit</Trans>
                          </Button>
                          <Button small onClick={() => startTest(o.provider)}>
                            <Trans id="ui2.admin.auth.test">Test</Trans>
                          </Button>
                        </>
                      )}
                      {!o.isCustomProvider && o.clientID && isAdmin && (
                        <Toggle
                          checked={o.isEnabled}
                          disabled={cantDisable && o.isEnabled}
                          onChange={(v) => toggleSystemProvider(o, v)}
                          ariaLabel={i18n._({ id: "ui2.admin.auth.providertoggle", message: "Sign in with {name}", values: { name: o.displayName } })}
                          label={
                            o.isEnabled
                              ? i18n._({ id: "ui2.admin.auth.enabled", message: "Enabled" })
                              : i18n._({ id: "ui2.admin.auth.disabled", message: "Disabled" })
                          }
                        />
                      )}
                      {!o.isCustomProvider && !o.clientID && (
                        <span className="u2-muted">
                          <Trans id="ui2.admin.auth.notconfigured">Not configured</Trans>
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </AdminSection>
        </>
      )}
    </AdminLayout>
  )
}

export default ManageAuthenticationPage
