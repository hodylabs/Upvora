import "../../components/account/account.css"
import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure, uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { EmailVerificationKind } from "@fider/models"
import { Button, Form, TextInput } from "../../components/form"

interface CompleteSignInProfilePageProps {
  kind: EmailVerificationKind
  k: string
  c?: string
}

// Copied from classic's SignIn/CompleteSignInProfile.page.tsx: a path to go to only if
// it stays on this site.
export const sameOriginPath = (redirect: string | undefined, origin: string): string | undefined => {
  if (!redirect || !redirect.startsWith("/")) return undefined
  try {
    const u = new URL(redirect, origin)
    return u.origin === origin ? u.pathname + u.search + u.hash : undefined
  } catch {
    return undefined
  }
}

const CompleteSignInProfilePage = (props: CompleteSignInProfilePageProps) => {
  const fider = useFider()
  const [name, setName] = useState("")
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)
  const logo = uploadedImageURL(fider.session.tenant.logoBlobKey, 100)

  const submit = async () => {
    setBusy(true)
    const result = await actions.completeProfile(props.kind, props.k, name)
    if (result.ok) {
      const redirect = sameOriginPath((result.data as { redirect?: string } | undefined)?.redirect, location.origin)
      location.href = redirect || (props.c !== undefined ? "/?c=" + props.c : "/")
      return
    }
    setBusy(false)
    setError(result.error)
  }

  return (
    <section className="u2-panel u2-auth" aria-labelledby="u2-cp-title">
      {logo && (
        <a href="/">
          <img className="u2-auth__logo" src={logo} alt={fider.session.tenant.name} width={56} height={56} />
        </a>
      )}
      <h1 id="u2-cp-title" className="u2-auth__title">
        <Trans id="modal.completeprofile.header">Complete your profile</Trans>
      </h1>
      <p className="u2-auth__lede">
        <Trans id="modal.completeprofile.text">Because this is your first sign in, please enter your name.</Trans>
      </p>
      <Form error={error} onSubmit={submit}>
        <TextInput
          stacked
          name="name"
          label={i18n._({ id: "modal.completeprofile.name.placeholder", message: "Name" })}
          autoComplete="name"
          autoFocus
          maxLength={100}
          value={name}
          onChange={setName}
        />
        <div className="u2-signin__submit">
          <Button type="submit" variant="primary" block loading={busy} disabled={name === ""}>
            <Trans id="action.submit">Submit</Trans>
          </Button>
        </div>
      </Form>
    </section>
  )
}

export default CompleteSignInProfilePage
