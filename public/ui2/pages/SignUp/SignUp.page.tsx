import "../../components/account/account.css"
import React, { useEffect, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure, jwt, querystring } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button, Form, TextInput } from "../../components/form"
import { SignInControl } from "../../components/account/SignInControl"
import { LegalAgreement } from "../../components/account/Legal"

// Create a new site (multi-host mode), as classic's SignUp.page: who you are (OAuth
// token from the provider, or name and email), the site's name and subdomain with a live
// availability check, and the terms when the site has them.

interface Subdomain {
  name: string
  available: boolean
  message: string
}

const oauthUser = () => {
  const token = querystring.get("token")
  const data = token ? jwt.decode(token) : undefined
  return token && data ? { token, name: data["oauth/name"] as string, email: data["oauth/email"] as string } : undefined
}

const SignUpPage = () => {
  const fider = useFider()
  const [user] = useState(oauthUser)
  const [agreed, setAgreed] = useState(false)
  const [tenantName, setTenantName] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [sub, setSub] = useState<Subdomain>({ name: "", available: false, message: "" })
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)
  const singleHost = fider.isSingleHostMode()

  // Ask the server half a second after typing stops; ignore answers for an old value.
  useEffect(() => {
    if (!sub.name) return
    let current = true
    const timer = window.setTimeout(async () => {
      const result = await actions.checkAvailability(sub.name)
      if (current) setSub((s) => ({ ...s, available: !result.data.message, message: result.data.message }))
    }, 500)
    return () => {
      current = false
      window.clearTimeout(timer)
    }
  }, [sub.name])

  const confirm = async () => {
    setBusy(true)
    const result = await actions.createTenant({
      token: user?.token,
      legalAgreement: agreed,
      tenantName,
      subdomain: sub.name,
      name,
      email,
    })
    if (result.ok) {
      if (singleHost) {
        location.reload()
      } else {
        const port = location.port ? `:${location.port}` : ""
        location.href = `${location.protocol}//${sub.name}${fider.settings.domain}${port}`
      }
      return
    }
    setBusy(false)
    setError(result.error)
  }

  return (
    <section className="u2-panel u2-auth u2-auth--wide" aria-labelledby="u2-signup-title">
      <img className="u2-auth__logo" src="/static/assets/logo.png" alt="" width={56} height={56} />
      <h1 id="u2-signup-title" className="u2-auth__title">
        <Trans id="ui2.signup.title">Create your feedback site</Trans>
      </h1>
      <Form error={error} autoComplete="on" onSubmit={confirm}>
        <h2 className="u2-section__title">
          <Trans id="ui2.signup.who">1. Who are you?</Trans>
        </h2>
        {user ? (
          <p>
            <Trans id="ui2.signup.hello">
              Hello, <b>{user.name}</b>
            </Trans>{" "}
            {user.email && `(${user.email})`}
          </p>
        ) : (
          <>
            <p className="u2-section__lede">
              <Trans id="ui2.signup.identify">We need to identify you to set up your new site.</Trans>
            </p>
            <SignInControl useEmail={false} />
            <TextInput name="name" label={i18n._({ id: "label.name", message: "Name" })} autoComplete="name" maxLength={100} value={name} onChange={setName} />
            <TextInput
              name="email"
              type="email"
              label={i18n._({ id: "label.email", message: "Email" })}
              autoComplete="email"
              maxLength={200}
              value={email}
              onChange={setEmail}
            />
          </>
        )}

        <h2 className="u2-section__title u2-signup__step">
          <Trans id="ui2.signup.what">2. What is this feedback site for?</Trans>
        </h2>
        <TextInput
          name="tenantName"
          label={i18n._({ id: "ui2.signup.sitename", message: "Site name" })}
          hint={i18n._({ id: "ui2.signup.sitename.hint", message: "Your company or product name" })}
          maxLength={60}
          value={tenantName}
          onChange={setTenantName}
        />
        {!singleHost && (
          <TextInput
            name="subdomain"
            label={i18n._({ id: "ui2.signup.subdomain", message: "Subdomain" })}
            maxLength={40}
            suffix={fider.settings.domain}
            value={sub.name}
            onChange={(v) => setSub({ name: v, available: false, message: "" })}
            errors={sub.message ? [sub.message] : undefined}
            after={
              sub.available && (
                <span className="u2-signin__ok" role="status">
                  <Trans id="ui2.signup.available">This subdomain is available!</Trans>
                </span>
              )
            }
          />
        )}
        <div className="u2-fld u2-fld--stacked">
          <LegalAgreement checked={agreed} onChange={setAgreed} />
        </div>
        <div className="u2-actions">
          <Button type="submit" variant="primary" loading={busy}>
            <Trans id="action.confirm">Confirm</Trans>
          </Button>
        </div>
      </Form>
    </section>
  )
}

export default SignUpPage
