import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

const Error500 = () => (
  <ErrorLayout code="500" showHomeLink={true} title={<Trans id="error.internalerror.title">Shoot! Well, this is unexpected…</Trans>}>
    <p>
      <Trans id="error.internalerror.text">An error has occurred and we&apos;re working to fix the problem! We’ll be up and running shortly.</Trans>
    </p>
  </ErrorLayout>
)

export default Error500
