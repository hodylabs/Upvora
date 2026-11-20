import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

// The generic error page (classic shows it from its error boundary). Not a server page:
// the shell's ErrorBoundary can render it with the caught error.
interface ErrorPageProps {
  error?: Error
  errorInfo?: React.ErrorInfo
  // Only outside production: the stack helps whoever is building.
  showDetails?: boolean
}

export const ErrorPage = (props: ErrorPageProps) => (
  <ErrorLayout showHomeLink={true} title={<Trans id="ui2.error.title">Shoot! Well, this is unexpected…</Trans>}>
    <p>
      <Trans id="ui2.error.text">An error has occurred and we&apos;re working to fix the problem!</Trans>
    </p>
    <p>
      <a href={typeof location !== "undefined" ? location.href : "/"}>
        <Trans id="ui2.error.reload">Reload the page</Trans>
      </a>
    </p>
    {props.showDetails && props.error && (
      <pre className="u2-errpage__details">
        {props.error.toString()}
        {props.errorInfo?.componentStack}
      </pre>
    )}
  </ErrorLayout>
)

export default ErrorPage
