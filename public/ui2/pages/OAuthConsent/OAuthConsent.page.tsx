import "../../components/account/account.css"
import React, { useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { actions, uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button } from "../../components/form"

// MCP sign-in consent. Same server flow as classic's OAuthConsent.page: the decision is
// one POST to /_api/oauth2/authorize (the session and the MCP consent cookie travel with
// it; the server checks both), and the answer's redirect is followed only if safe.

interface OAuthConsentPageProps {
  error?: string
  clientName?: string
  redirectHost?: string
  scope?: string
  clientId?: string
  redirectUri?: string
  codeChallenge?: string
  codeChallengeMethod?: string
  state?: string
  // Set when the connection goes through an MCP-only public address.
  connectingThrough?: string
}

// Copied from classic: refuse schemes a browser would execute. The server already
// rejects them at client registration; this is defense in depth.
export const isSafeRedirect = (target: string): boolean => {
  try {
    const protocol = new URL(target).protocol.toLowerCase()
    return !["javascript:", "data:", "vbscript:", "file:", "blob:", "about:"].includes(protocol)
  } catch {
    return false
  }
}

const OAuthConsentPage = (props: OAuthConsentPageProps) => {
  const fider = useFider()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // One decision at a time: a ref updates synchronously, so a double click or
  // Allow-then-Cancel cannot send a second decision while one is in flight.
  const inFlight = useRef(false)
  const siteName = fider.session.tenant?.name
  const userName = fider.session.isAuthenticated ? fider.session.user.name : ""
  const logo = uploadedImageURL(fider.session.tenant?.logoBlobKey, 100)

  const decide = async (approve: boolean) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailed(false)
    const result = await actions.decideOAuthAuthorization({
      clientId: props.clientId || "",
      redirectUri: props.redirectUri || "",
      codeChallenge: props.codeChallenge || "",
      codeChallengeMethod: props.codeChallengeMethod || "",
      scope: props.scope || "",
      state: props.state || "",
      approve,
    })
    if (result.ok && result.data && isSafeRedirect(result.data.redirect)) {
      window.location.href = result.data.redirect
      return
    }
    inFlight.current = false
    setFailed(true)
    setBusy(false)
  }

  return (
    <section className="u2-panel u2-auth" aria-labelledby={props.error ? undefined : "u2-consent-title"} aria-label={props.error ? siteName : undefined}>
      {logo && <img className="u2-auth__logo" src={logo} alt="" width={56} height={56} />}
      {props.error ? (
        <p className="u2-form__error" role="alert">
          {props.error}
        </p>
      ) : (
        <>
          <h1 id="u2-consent-title" className="u2-auth__title">
            <Trans id="oauth.consent.title">
              Allow <strong>{props.clientName}</strong> to use {siteName} as you?
            </Trans>
          </h1>
          <p className="u2-auth__lede">
            {props.scope === "upvora:read" ? (
              <Trans id="oauth.consent.scope.read">It will be able to read everything you can see here, but not change anything.</Trans>
            ) : (
              <Trans id="oauth.consent.scope.full">
                It will be able to do everything you can do here: share and edit ideas, comment, vote, and use any settings your role allows.
              </Trans>
            )}
          </p>
          {props.scope && (
            <p className="u2-center">
              <span className="u2-mono u2-muted">{props.scope}</span>
            </p>
          )}
          {userName && (
            <p className="u2-center">
              <Trans id="oauth.consent.signedInAs">
                Signed in as <strong>{userName}</strong>. Not you? Close this page and sign out first.
              </Trans>
            </p>
          )}
          <p className="u2-center u2-muted">
            <Trans id="oauth.consent.redirect">After you choose, you will return to {props.redirectHost}.</Trans>
          </p>
          {props.connectingThrough && (
            <p className="u2-center u2-muted">
              <Trans id="oauth.consent.through">You are connecting through {props.connectingThrough}, this site&apos;s public address for AI assistants.</Trans>
            </p>
          )}
          {failed && (
            <p className="u2-form__error" role="alert">
              <Trans id="oauth.consent.failed">Something went wrong. Please try again, or close this page and reconnect from your app.</Trans>
            </p>
          )}
          <div className="u2-signin__submit">
            <Button variant="primary" block disabled={busy} onClick={() => decide(true)}>
              <Trans id="oauth.consent.allow">Allow</Trans>
            </Button>
            <Button variant="ghost" block disabled={busy} onClick={() => decide(false)}>
              <Trans id="oauth.consent.cancel">Cancel</Trans>
            </Button>
          </div>
        </>
      )}
    </section>
  )
}

export default OAuthConsentPage
