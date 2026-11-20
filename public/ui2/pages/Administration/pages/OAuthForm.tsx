import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { ImageUpload, OAuthConfig, OAuthConfigStatus } from "@fider/models"
import { actions, Failure, uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button, Field, Form, ImageUploader, TextInput, Toggle } from "../../../components/form"
import { AdminSection } from "../AdminLayout"

// Classic's OAuthForm: add or edit a custom OAuth provider. The stored client secret
// is never shown; "change" clears it and enables the field, and an untouched secret
// is sent empty so the server keeps the stored one.

interface OAuthFormProps {
  config?: OAuthConfig
  onCancel: () => void
  cantDisable: boolean
}

type TextKey =
  | "displayName"
  | "clientID"
  | "authorizeURL"
  | "tokenURL"
  | "scope"
  | "profileURL"
  | "jsonUserIDPath"
  | "jsonUserNamePath"
  | "jsonUserEmailPath"
  | "jsonUserRolesPath"
  | "allowedRoles"

export const OAuthForm = (props: OAuthFormProps) => {
  const fider = useFider()
  const c = props.config
  const ro = !fider.session.user.isAdministrator
  const [text, setText] = useState<Record<TextKey, string>>({
    displayName: c?.displayName || "",
    clientID: c?.clientID || "",
    authorizeURL: c?.authorizeURL || "",
    tokenURL: c?.tokenURL || "",
    scope: c?.scope || "",
    profileURL: c?.profileURL || "",
    jsonUserIDPath: c?.jsonUserIDPath || "",
    jsonUserNamePath: c?.jsonUserNamePath || "",
    jsonUserEmailPath: c?.jsonUserEmailPath || "",
    jsonUserRolesPath: c?.jsonUserRolesPath || "",
    allowedRoles: c?.allowedRoles || "",
  })
  const [enabled, setEnabled] = useState(c?.status === OAuthConfigStatus.Enabled)
  const [isTrusted, setTrusted] = useState(!!c?.isTrusted)
  const [clientSecret, setClientSecret] = useState(c?.clientSecret || "")
  const [clientSecretEnabled, setClientSecretEnabled] = useState(!c)
  const [logo, setLogo] = useState<ImageUpload | undefined>()
  const [logoURL, setLogoURL] = useState<string | undefined>()
  const [logoBlobKey, setLogoBlobKey] = useState(c?.logoBlobKey || "")
  const [error, setError] = useState<Failure | undefined>()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const result = await actions.saveOAuthConfig({
      provider: c?.provider || "",
      status: enabled ? OAuthConfigStatus.Enabled : OAuthConfigStatus.Disabled,
      isTrusted,
      ...text,
      clientSecret: clientSecretEnabled ? clientSecret : "",
      logo,
    })
    if (result.ok) {
      location.reload()
      return
    }
    setSaving(false)
    setError(result.error)
  }

  const input = (name: TextKey, label: React.ReactNode, maxLength: number, hint?: React.ReactNode) => (
    <TextInput
      name={name}
      label={label}
      hint={hint}
      maxLength={maxLength}
      value={text[name]}
      disabled={ro}
      onChange={(v) => setText((t) => ({ ...t, [name]: v }))}
    />
  )

  const previewLogo = logoURL || (logoBlobKey ? uploadedImageURL(logoBlobKey, 100) : undefined)
  const optional = (
    <Trans id="ui2.admin.oauth.optional">
      Optional, but <strong>highly</strong> recommended.
    </Trans>
  )
  const visibility = fider.session.tenant.isPrivate
    ? i18n._({ id: "ui2.admin.oauth.private", message: "Private" })
    : fider.session.tenant.isSignUpDisabled
      ? i18n._({ id: "ui2.admin.oauth.nosignups", message: "Public, sign-ups disabled" })
      : i18n._({ id: "ui2.admin.oauth.public", message: "Public" })

  return (
    <AdminSection
      title={
        c ? <Trans id="ui2.admin.oauth.edittitle">OAuth Provider: {c.displayName}</Trans> : <Trans id="ui2.admin.oauth.newtitle">New OAuth Provider</Trans>
      }
    >
      <Form error={error} onSubmit={save}>
        {input("displayName", <Trans id="ui2.admin.oauth.displayname">Display Name</Trans>, 50)}
        <Field label={<Trans id="ui2.admin.oauth.preview">Button Preview</Trans>} group>
          <span className="u2-btn u2-btn--secondary u2-oauth__preview" aria-hidden="true">
            {previewLogo && <img src={previewLogo} alt="" width={18} height={18} />}
            {text.displayName || "Button"}
          </span>
        </Field>
        <Field
          name="logo"
          group
          label={<Trans id="ui2.admin.oauth.logo">Logo</Trans>}
          hint={
            <Trans id="ui2.admin.oauth.logohint">
              We accept JPG, GIF and PNG images, smaller than 50KB and with an aspect ratio of 1:1 with minimum dimensions of 24x24 pixels.
            </Trans>
          }
        >
          {(a) => (
            <ImageUploader
              bkey={logoBlobKey || undefined}
              describedBy={a["aria-describedby"]}
              disabled={ro}
              onChange={(upload, url) => {
                setLogo(upload)
                setLogoURL(url)
                setLogoBlobKey("")
              }}
            />
          )}
        </Field>
        {input("clientID", <Trans id="ui2.admin.oauth.clientid">Client ID</Trans>, 100)}
        <TextInput
          name="clientSecret"
          label={<Trans id="ui2.admin.oauth.clientsecret">Client Secret</Trans>}
          maxLength={500}
          value={clientSecret}
          disabled={!clientSecretEnabled}
          onChange={setClientSecret}
          autoComplete="off"
          hint={!clientSecretEnabled ? <Trans id="ui2.admin.oauth.secretomitted">Omitted for security reasons.</Trans> : undefined}
          after={
            !clientSecretEnabled ? (
              <div>
                <Button
                  small
                  variant="ghost"
                  onClick={() => {
                    setClientSecret("")
                    setClientSecretEnabled(true)
                  }}
                >
                  <Trans id="ui2.admin.oauth.secretchange">Change</Trans>
                </Button>
              </div>
            ) : undefined
          }
        />
        {input("authorizeURL", <Trans id="ui2.admin.oauth.authorizeurl">Authorize URL</Trans>, 300)}
        {input("tokenURL", <Trans id="ui2.admin.oauth.tokenurl">Token URL</Trans>, 300)}
        {input(
          "scope",
          <Trans id="ui2.admin.oauth.scope">Scope</Trans>,
          100,
          <Trans id="ui2.admin.oauth.scopehint">
            It is recommended to only request the minimum scopes we need to fetch the user <strong>id</strong>, <strong>name</strong> and <strong>email</strong>
            . Multiple scopes must be separated by space.
          </Trans>
        )}

        <AdminSection
          title={<Trans id="ui2.admin.oauth.profile">User Profile</Trans>}
          lede={<Trans id="ui2.admin.oauth.profilehint">This section is used to configure how Fider will fetch user after the authentication process.</Trans>}
        >
          {input(
            "profileURL",
            <Trans id="ui2.admin.oauth.profileurl">Profile API URL</Trans>,
            300,
            <Trans id="ui2.admin.oauth.profileurlhint">
              The URL to fetch the authenticated user info. If empty, Fider will try to parse the user info from the Access Token.
            </Trans>
          )}
        </AdminSection>

        <AdminSection
          title={<Trans id="ui2.admin.oauth.jsonpath">JSON Path</Trans>}
          lede={
            <Trans id="ui2.admin.oauth.jsonpathhint">
              Find out more about{" "}
              <a rel="noopener" target="_blank" href="https://docs.fider.io/configuring-oauth#configuring-the-json-paths">
                configuring the JSON Paths
              </a>
              .
            </Trans>
          }
        >
          {input(
            "jsonUserIDPath",
            <Trans id="ui2.admin.oauth.jsonid">ID</Trans>,
            100,
            <Trans id="ui2.admin.oauth.jsonidhint">Make sure it&apos;s unique.</Trans>
          )}
          {input("jsonUserNamePath", <Trans id="ui2.admin.oauth.jsonname">Name</Trans>, 100, optional)}
          {input("jsonUserEmailPath", <Trans id="ui2.admin.oauth.jsonemail">Email</Trans>, 100, optional)}
          {input(
            "jsonUserRolesPath",
            <Trans id="ui2.admin.oauth.jsonroles">Roles</Trans>,
            100,
            <Trans id="ui2.admin.oauth.jsonroleshint">Optional. JSON path to extract roles from the provider profile.</Trans>
          )}
          {input(
            "allowedRoles",
            <Trans id="ui2.admin.oauth.allowedroles">Allowed Roles</Trans>,
            500,
            <Trans id="ui2.admin.oauth.allowedroleshint">
              Optional. Comma-separated list of roles allowed to sign in, e.g. <strong>ROLE_ADMIN,ROLE_TEACHER</strong>. Only enforced when a Roles JSON path is
              also configured. Leave empty to allow all roles.
            </Trans>
          )}
        </AdminSection>

        <Field
          name="isTrusted"
          group
          label={<Trans id="ui2.admin.oauth.trusted">Trusted Source</Trans>}
          hint={
            <>
              <Trans id="ui2.admin.oauth.trustedsite">
                This setting only applies to private sites or when sign-ups are disabled. This site is currently <strong>{visibility}</strong>.
              </Trans>{" "}
              <Trans id="ui2.admin.oauth.trustedhint">
                If enabled, users authenticated by this provider can get access to this site without being invited. This is recommended for corporate access,
                such as Okta, Microsoft AD, Google Workspace and others. Do not use this for public identity providers such as Facebook or Twitter.
              </Trans>
            </>
          }
        >
          <Toggle checked={isTrusted} onChange={setTrusted} label={i18n._({ id: "ui2.admin.oauth.trusted", message: "Trusted Source" })} hideLabel />
        </Field>

        <Field
          name="status"
          group
          label={<Trans id="ui2.admin.oauth.status">Status</Trans>}
          hint={
            enabled ? (
              <>
                {props.cantDisable && (
                  <>
                    <Trans id="ui2.admin.oauth.cantdisable">You need to enable email authentication if you want to disable all OAuth providers.</Trans>{" "}
                  </>
                )}
                <Trans id="ui2.admin.oauth.enabledhint">
                  This provider will be available for everyone to use during the sign in process. It is recommended that you keep it disable and test it before
                  enabling it. The Test button is available after saving this configuration.
                </Trans>
              </>
            ) : (
              <Trans id="ui2.admin.oauth.disabledhint">Users won&apos;t be able to sign in with this Provider.</Trans>
            )
          }
        >
          <Toggle checked={enabled} disabled={props.cantDisable} onChange={setEnabled} label={i18n._({ id: "ui2.admin.oauth.enabled", message: "Enabled" })} />
        </Field>

        <div className="u2-actions">
          <Button variant="ghost" onClick={props.onCancel}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            <Trans id="action.save">Save</Trans>
          </Button>
        </div>
      </Form>
    </AdminSection>
  )
}
