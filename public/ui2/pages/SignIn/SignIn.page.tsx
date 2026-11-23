import "../../components/account/account.css"
import React from "react"
import { Trans } from "@lingui/react/macro"
import { useFider } from "@fider/hooks"
import { TenantStatus } from "@fider/models"
import { SignInControl } from "../../components/account/SignInControl"
import { LegalNotice } from "../../components/account/Legal"
import { AuthBrand } from "../../components/account/AuthBrand"

// Which message goes above the options (same rule as classic's SignIn.page): a public,
// active site only reaches this page with ?redirect= (e.g. connecting an MCP client).
export const signInIntro = (tenant: { isPrivate: boolean; status: TenantStatus }): "locked" | "private" | "default" => {
  if (tenant.status === TenantStatus.Locked) return "locked"
  return tenant.isPrivate ? "private" : "default"
}

// Only same-site paths are followed after sign-in.
export const redirectTarget = (baseURL: string, search: string): string => {
  const redirect = new URLSearchParams(search).get("redirect")
  return redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? baseURL + redirect : baseURL
}

const SignInPage = () => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const target = redirectTarget(fider.settings.baseURL, window.location.search)

  const intro = {
    locked: (
      <>
        <h1 className="u2-auth__title">
          <Trans id="signin.message.locked.title">
            <strong>{tenant.name}</strong> is currently locked.
          </Trans>
        </h1>
        <p className="u2-auth__lede">
          <Trans id="signin.message.locked.text">To reactivate this site, sign in with an administrator account and update the required settings.</Trans>
        </p>
      </>
    ),
    private: (
      <>
        <h1 className="u2-auth__title">
          <Trans id="signin.message.private.title">
            <strong>{tenant.name}</strong> is a private space, you must sign in to participate and vote.
          </Trans>
        </h1>
        <p className="u2-auth__lede">
          <Trans id="signin.message.private.text">If you have an account or an invitation, you may use following options to sign in.</Trans>
        </p>
      </>
    ),
    default: (
      <h1 className="u2-auth__title u2-auth__lede">
        <Trans id="signin.message.default.title">
          Sign in to <strong>{tenant.name}</strong> to continue.
        </Trans>
      </h1>
    ),
  }[signInIntro(tenant)]

  return (
    <section className="u2-panel u2-auth" aria-label={tenant.name}>
      <AuthBrand link />
      {intro}
      <SignInControl useEmail={true} redirectTo={target} onCodeVerified={() => (location.href = target)} />
      <LegalNotice />
    </section>
  )
}

export default SignInPage
