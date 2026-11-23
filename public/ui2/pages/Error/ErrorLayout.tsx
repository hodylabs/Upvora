import "./error.css"
import React from "react"
import { Trans } from "@lingui/react/macro"
import { useFider } from "@fider/hooks"
import { AuthBrand } from "../../components/account/AuthBrand"
import { signInHref } from "../../lib/nav"

interface ErrorLayoutProps {
  // The status code shown large, in mono (the page's bit of personality).
  code?: string
  title: React.ReactNode
  children?: React.ReactNode
  // Same rule as classic's ErrorPageWrapper: only when there is a site to go back to.
  showHomeLink: boolean
}

export const ErrorLayout = (props: ErrorLayoutProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const actions = props.showHomeLink && tenant
  return (
    <section className="u2-panel u2-auth u2-errpage" aria-labelledby="u2-err-title">
      {props.code ? (
        <p className="u2-errpage__code u2-mono" aria-hidden="true">
          {props.code}
        </p>
      ) : (
        <AuthBrand />
      )}
      <h1 id="u2-err-title" className="u2-auth__title">
        {props.title}
      </h1>
      <div className="u2-errpage__text">{props.children}</div>
      {actions && (
        <div className="u2-errpage__actions">
          <a className="u2-btn u2-btn--primary" href={fider.settings.baseURL}>
            <Trans id="ui2.error.home">Go to the home page</Trans>
          </a>
          {!fider.session.isAuthenticated && (
            <a className="u2-btn" href={signInHref()}>
              <Trans id="action.signin">Sign in</Trans>
            </a>
          )}
          {/* Only when there is a page to go back to: a link opened in a new tab has none. */}
          {typeof history !== "undefined" && history.length > 1 && (
            <button type="button" className="u2-btn u2-btn--ghost" onClick={() => history.back()}>
              <Trans id="ui2.error.back">Go back</Trans>
            </button>
          )}
        </div>
      )}
    </section>
  )
}
