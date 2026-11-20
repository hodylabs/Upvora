import React, { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { actions } from "@fider/services"
import { useFider } from "@fider/hooks"

// Shown for any page the new UI has not built yet. Administrators can switch the
// site back to classic from here, so the new look can never strand a site.
export const NotYet = () => {
  const fider = useFider()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const isAdmin = fider.session.isAuthenticated && fider.session.user.isAdministrator

  const switchToClassic = async () => {
    setBusy(true)
    const result = await actions.updateTenantUI("classic")
    if (result.ok) {
      location.reload()
    } else {
      setBusy(false)
      setFailed(true)
    }
  }

  return (
    <section className="u2-panel u2-notyet" aria-labelledby="u2-notyet-title">
      <h1 id="u2-notyet-title">
        <Trans id="ui2.notyet.title">This page is not in the new look yet</Trans>
      </h1>
      <p className="u2-muted">
        <Trans id="ui2.notyet.text">The new look is being built page by page. Everything else on this site keeps working.</Trans>
      </p>
      <p className="u2-mono u2-muted">{fider.session.page}</p>
      {isAdmin && (
        <div className="u2-row">
          <button type="button" className="u2-btn u2-btn--primary" onClick={switchToClassic} disabled={busy}>
            <Trans id="ui2.notyet.switch">Switch this site back to Classic</Trans>
          </button>
          {failed && (
            <span role="alert" className="u2-danger">
              <Trans id="ui2.notyet.failed">The look could not be changed. Please try again.</Trans>
            </span>
          )}
        </div>
      )}
    </section>
  )
}
