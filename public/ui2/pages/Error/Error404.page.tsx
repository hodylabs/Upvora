import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

const Error404 = () => (
  <ErrorLayout code="404" showHomeLink={true} title={<Trans id="error.pagenotfound.title">Page not found</Trans>}>
    <p>
      <Trans id="error.pagenotfound.text">The link you clicked may be broken or the page may have been removed.</Trans>
    </p>
  </ErrorLayout>
)

export default Error404
