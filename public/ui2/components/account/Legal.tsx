import React from "react"
import { Trans } from "@lingui/react/macro"
import { useFider } from "@fider/hooks"
import { Checkbox } from "../form/Choice"

// The legal links and the sign-in notice, shown only when the site has terms
// (fider.settings.hasLegal), as in classic's components/common/Legal.tsx.

const Terms = () => (
  <a href="/terms" target="_blank">
    <Trans id="legal.termsofservice">Terms of Service</Trans>
  </a>
)

const Privacy = () => (
  <a href="/privacy" target="_blank">
    <Trans id="legal.privacypolicy">Privacy Policy</Trans>
  </a>
)

export const LegalNotice = () => {
  const fider = useFider()
  if (!fider.settings.hasLegal) return null
  return (
    <p className="u2-auth__legal">
      <Trans id="ui2.legal.notice">
        By signing in, you agree to the <Privacy /> and <Terms />.
      </Trans>
    </p>
  )
}

export const LegalAgreement = (props: { checked: boolean; onChange: (agreed: boolean) => void }) => {
  const fider = useFider()
  if (!fider.settings.hasLegal) return null
  return (
    <Checkbox
      name="legalAgreement"
      checked={props.checked}
      onChange={props.onChange}
      label={
        <Trans id="legal.agreement">
          I have read and agree to the <Privacy /> and <Terms />.
        </Trans>
      }
    />
  )
}
