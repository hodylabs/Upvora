import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

const Error403 = () => (
  <ErrorLayout code="403" showHomeLink={true} title={<Trans id="error.forbidden.title">Forbidden</Trans>}>
    <p>
      <Trans id="error.forbidden.text">You are not authorized to view this page.</Trans>
    </p>
  </ErrorLayout>
)

export default Error403
