import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

const NotInvited = () => (
  <ErrorLayout showHomeLink={true} title={<Trans id="error.notinvited.title">Not Invited</Trans>}>
    <p>
      <Trans id="error.notinvited.text">We could not find an account for your email address.</Trans>
    </p>
  </ErrorLayout>
)

export default NotInvited
