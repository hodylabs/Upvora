import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

const AccessDenied = () => (
  <ErrorLayout showHomeLink={true} title={<Trans id="error.accessdenied.title">Access Denied</Trans>}>
    <p>
      <Trans id="error.accessdenied.text">You do not have the required permissions to access this site.</Trans>
    </p>
    <p className="u2-muted">
      <Trans id="error.accessdenied.contact">If you believe this is an error, please contact your administrator.</Trans>
    </p>
  </ErrorLayout>
)

export default AccessDenied
