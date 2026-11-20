import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

const Error410 = () => (
  <ErrorLayout code="410" showHomeLink={true} title={<Trans id="error.expired.title">Expired</Trans>}>
    <p>
      <Trans id="error.expired.text">The link you clicked has expired.</Trans>
    </p>
  </ErrorLayout>
)

export default Error410
