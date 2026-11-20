import "./error.css"
import React from "react"
import { Trans } from "@lingui/react/macro"
import { useFider } from "@fider/hooks"
import { uploadedImageURL } from "@fider/services"

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
  const logo = tenant ? uploadedImageURL(tenant.logoBlobKey, 100) : undefined
  return (
    <section className="u2-panel u2-errpage" aria-labelledby="u2-err-title">
      {props.code ? (
        <p className="u2-errpage__code u2-mono" aria-hidden="true">
          {props.code}
        </p>
      ) : (
        logo && <img className="u2-errpage__logo" src={logo} alt="" width={48} height={48} />
      )}
      <h1 id="u2-err-title" className="u2-errpage__title">
        {props.title}
      </h1>
      <div className="u2-errpage__text">{props.children}</div>
      {props.showHomeLink && tenant && (
        <p className="u2-errpage__home">
          <Trans id="page.backhome">
            Take me back to <a href={fider.settings.baseURL}>{fider.settings.baseURL}</a> home page.
          </Trans>
        </p>
      )}
    </section>
  )
}
