import "../../components/account/account.css"
import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure } from "@fider/services"
import { Button } from "../../components/form"
import { AuthBrand } from "../../components/account/AuthBrand"

const PendingActivationPage = () => {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<Failure | undefined>()

  const resend = async () => {
    setBusy(true)
    setError(undefined)
    setSent(false)
    const result = await actions.resendSignUpEmail()
    setBusy(false)
    if (result.ok) setSent(true)
    else setError(result.error)
  }

  return (
    <section className="u2-panel u2-auth u2-center" aria-labelledby="u2-pending-title">
      <AuthBrand />
      <span className="u2-auth__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
        </svg>
      </span>
      <h1 id="u2-pending-title" className="u2-auth__title">
        <Trans id="page.pendingactivation.title">Your account is pending activation</Trans>
      </h1>
      <p className="u2-auth__lede">
        <Trans id="page.pendingactivation.text">We sent you a confirmation email with a link to activate your site.</Trans>{" "}
        <Trans id="page.pendingactivation.text2">Please check your inbox to activate it.</Trans>
      </p>
      {sent && (
        <p className="u2-signin__ok" role="status">
          {i18n._({ id: "ui2.pendingactivation.sent", message: "Verification email sent. Please check your inbox." })}
        </p>
      )}
      {error?.errors && error.errors.length > 0 && (
        <div className="u2-form__error" role="alert">
          {error.errors.map((e, i) => (
            <div key={i}>{e.message}</div>
          ))}
        </div>
      )}
      <p className="u2-muted">
        <Trans id="page.pendingactivation.didntreceive">Didn&apos;t receive the email?</Trans>
      </p>
      <Button variant="primary" onClick={resend} loading={busy}>
        {busy ? <Trans id="page.pendingactivation.resending">Resending...</Trans> : <Trans id="page.pendingactivation.resend">Resend verification email</Trans>}
      </Button>
    </section>
  )
}

export default PendingActivationPage
