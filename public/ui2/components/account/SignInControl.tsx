import "./account.css"
import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, device, Failure, isCookieEnabled, uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { OAuthProviderOption } from "@fider/models"
import { Button } from "../form/Button"
import { Form } from "../form/Form"
import { TextInput } from "../form/TextInput"
import { systemProviderLogos } from "./providerLogos"

// Sign in with an OAuth provider or by email code. Same steps, calls and messages as
// classic's components/common/SignInControl.tsx: email, then name (new people, when
// sign-up is allowed), then the 6-digit code with resend and the too-many-attempts lockout.

type Step = "email" | "name" | "code"

interface SignInControlProps {
  useEmail: boolean
  // Where OAuth sends the person back to; defaults to this page.
  redirectTo?: string
  // Runs before any sign-in starts (e.g. to save a draft).
  onSubmit?: () => void
  // After the code is accepted; defaults to reloading the page.
  onCodeVerified?: () => void
}

const providerLogo = (o: OAuthProviderOption & { logoURL?: string }): string | undefined =>
  o.logoURL || (o.logoBlobKey ? uploadedImageURL(o.logoBlobKey, 100) : systemProviderLogos[o.provider])

export const SignInControl = (props: SignInControlProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const [showEmail, setShowEmail] = useState(tenant ? tenant.isEmailAuthAllowed : true)
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<Failure | undefined>()
  const [resent, setResent] = useState("")
  const [lockedOut, setLockedOut] = useState(false)
  const [busy, setBusy] = useState(false)
  const autoFocus = !device.isTouch()

  const editEmail = () => {
    setStep("email")
    setName("")
    setCode("")
    setError(undefined)
    setResent("")
  }

  const signIn = async () => {
    props.onSubmit?.()
    const result = await actions.signIn(email)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(undefined)
    const data = result.data
    if (data && data.userExists === false) {
      if (!data.signUpAllowed) {
        setError({
          errors: [
            {
              field: "email",
              message: i18n._({
                id: "signin.message.signupdisabled",
                message: "We couldn't find an account for this email address. New sign-ups are currently disabled.",
              }),
            },
          ],
        })
        return
      }
      setStep("name")
    } else {
      setStep("code")
    }
  }

  const signUp = async () => {
    props.onSubmit?.()
    const result = await actions.signInNewUser(email, name)
    if (result.ok) {
      setError(undefined)
      setStep("code")
    } else {
      setError(result.error)
    }
  }

  const verify = async () => {
    const result = await actions.verifySignInCode(email, code)
    if (result.ok) {
      if (props.onCodeVerified) props.onCodeVerified()
      else location.reload()
      return
    }
    // The server answers a wrong code with { field: message } in the body.
    const data = result.data as unknown as Record<string, string> | undefined
    if (data && typeof data === "object" && !Array.isArray(data) && !("errors" in data)) {
      if (data.code && data.code.includes("Too many attempts")) {
        setLockedOut(true)
        setError(undefined)
        return
      }
      setError({ errors: Object.entries(data).map(([field, message]) => ({ field, message })) })
    } else {
      setError(result.error)
    }
  }

  const resend = async () => {
    setResent("")
    const result = await actions.resendSignInCode(email)
    if (result.ok) {
      setError(undefined)
      setCode("")
      setLockedOut(false)
      setResent(i18n._({ id: "signin.code.sent", message: "A new code has been sent to your email." }))
    } else {
      setError(result.error)
    }
  }

  const submit = async () => {
    setResent("")
    setBusy(true)
    try {
      if (step === "email") await signIn()
      else if (step === "name") await signUp()
      else await verify()
    } finally {
      setBusy(false)
    }
  }

  if (!isCookieEnabled()) {
    return (
      <div className="u2-form__error" role="alert">
        <strong>
          <Trans id="ui2.signin.cookies.title">Cookies required</Trans>
        </strong>
        <p>
          <Trans id="ui2.signin.cookies.text">Cookies are not enabled on your browser. Please enable cookies in your browser preferences to continue.</Trans>
        </p>
      </div>
    )
  }

  const providers = fider.settings.oauth || []
  const redirectTo = props.redirectTo || window.location.href

  return (
    <div className="u2-signin">
      {providers.length > 0 && (
        <div className="u2-signin__oauth">
          {providers.map((o) => {
            const href = o.url ? `${o.url}?redirect=${encodeURIComponent(redirectTo)}` : ""
            const logo = providerLogo(o)
            return (
              <a
                key={o.provider}
                rel="nofollow"
                className="u2-btn u2-btn--secondary u2-btn--block u2-signin__provider"
                href={href}
                onClick={(e) => {
                  if (props.onSubmit) {
                    e.preventDefault()
                    props.onSubmit()
                    window.location.href = href
                  }
                }}
              >
                {logo && <img src={logo} alt="" width={18} height={18} />}
                <span>
                  <Trans id="signin.message.socialbutton.intro">Continue with</Trans> {o.displayName}
                </span>
              </a>
            )
          })}
        </div>
      )}

      {props.useEmail && providers.length > 0 && (
        <div className="u2-signin__or" role="separator">
          <Trans id="ui2.signin.or">or</Trans>
        </div>
      )}

      {props.useEmail &&
        (showEmail ? (
          <Form error={error} autoComplete="on" onSubmit={submit}>
            {(step === "email" || step === "name") && (
              <TextInput
                stacked
                name="email"
                type="email"
                label={i18n._({ id: "label.email", message: "Email" })}
                placeholder={i18n._({ id: "signin.email.placeholder", message: "Email address" })}
                autoComplete="email"
                autoFocus={autoFocus}
                disabled={step === "name" || busy}
                value={email}
                onChange={setEmail}
                hint={
                  !tenant.isEmailAuthAllowed ? (
                    <span className="u2-danger">
                      <Trans id="signin.message.onlyadmins">Currently only allowed to sign in to an administrator account</Trans>
                    </span>
                  ) : undefined
                }
              />
            )}
            {step === "name" && (
              <TextInput
                stacked
                name="name"
                label={i18n._({ id: "label.name", message: "Name" })}
                placeholder={i18n._({ id: "signin.name.placeholder", message: "Your name" })}
                autoComplete="name"
                autoFocus={autoFocus}
                maxLength={100}
                value={name}
                onChange={setName}
              />
            )}
            {step === "code" && (
              <div className="u2-signin__code">
                {resent && (
                  <p className="u2-signin__ok" role="status">
                    {resent}
                  </p>
                )}
                {lockedOut ? (
                  <p className="u2-signin__note u2-signin__note--warn">
                    <Trans id="signin.code.locked">Your code has expired due to too many incorrect attempts. Please request a new one.</Trans>
                  </p>
                ) : (
                  <>
                    <p className="u2-signin__note">
                      <Trans id="signin.code.instruction">
                        Please type in the code we just sent to <strong>{email}</strong>
                      </Trans>{" "}
                      <button type="button" className="u2-linkbtn" onClick={editEmail}>
                        <Trans id="signin.code.edit">Edit</Trans>
                      </button>
                    </p>
                    <TextInput
                      stacked
                      name="code"
                      label={i18n._({ id: "ui2.signin.code.label", message: "Code" })}
                      placeholder={i18n._({ id: "signin.code.placeholder", message: "Type in the code here" })}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      autoFocus={autoFocus}
                      maxLength={6}
                      value={code}
                      onChange={setCode}
                    />
                  </>
                )}
              </div>
            )}

            <div className="u2-signin__submit">
              {step === "email" && (
                <Button type="submit" variant="primary" block loading={busy}>
                  <Trans id="signin.message.email">Continue with Email</Trans>
                </Button>
              )}
              {step === "name" && (
                <Button type="submit" variant="primary" block loading={busy}>
                  <Trans id="action.signup">Sign up</Trans>
                </Button>
              )}
              {step === "code" && !lockedOut && (
                <Button type="submit" variant="primary" block loading={busy} disabled={code.length !== 6}>
                  <Trans id="action.submit">Submit</Trans>
                </Button>
              )}
              {step === "code" && (
                <Button variant={lockedOut ? "primary" : "ghost"} block onClick={resend}>
                  <Trans id="signin.code.getnew">Get a new code</Trans>
                </Button>
              )}
            </div>
          </Form>
        ) : (
          <p className="u2-muted">
            <Trans id="ui2.signin.emaildisabled">
              Email authentication has been disabled by an administrator. If you have an administrator account and need to bypass this restriction, please{" "}
              <button type="button" className="u2-linkbtn" onClick={() => setShowEmail(true)}>
                click here
              </button>
              .
            </Trans>
          </p>
        ))}
    </div>
  )
}
