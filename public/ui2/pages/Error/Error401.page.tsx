import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

const Error401 = () => (
  <ErrorLayout code="401" showHomeLink={true} title={<Trans id="error.unauthorized.title">Unauthorized</Trans>}>
    <p>
      <Trans id="error.unauthorized.text">You need to sign in before accessing this page.</Trans>
    </p>
  </ErrorLayout>
)

export default Error401
