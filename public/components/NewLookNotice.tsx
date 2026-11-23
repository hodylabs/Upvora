import React, { useState } from "react"
import { useFider } from "@fider/hooks"
import { actions, cache } from "@fider/services"
import "./NewLookNotice.scss"

const HIDDEN_KEY = "upvora.newLookNotice.hidden"

// Classic only: tells administrators the new look is available and switches the site in one click.
// Upgraded sites stay on classic until an admin chooses this; new sites already start on the new look.
export const NewLookNotice = () => {
  const fider = useFider()
  const [hidden, setHidden] = useState(() => cache.local.has(HIDDEN_KEY))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (hidden || !fider.session.isAuthenticated || !fider.session.user.isAdministrator || fider.session.tenant.ui === "new") return null

  const switchLook = async () => {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const result = await actions.updateTenantUI("new").catch(() => ({ ok: false }))
    if (result.ok) {
      location.reload()
      return
    }
    setFailed(true)
    setBusy(false)
  }

  const hide = () => {
    cache.local.set(HIDDEN_KEY, "true")
    setHidden(true)
  }

  return (
    <div className="c-newlook" role="region" aria-label="New look">
      <span className="c-newlook__text">
        {failed
          ? "The look could not be changed. Please try again."
          : "A new look for your site is ready. It applies to everyone, and you can switch back any time in Site Settings, General."}
      </span>
      <button type="button" className="c-newlook__go" onClick={switchLook} disabled={busy}>
        {busy ? "Switching..." : "Switch to the new look"}
      </button>
      <button type="button" className="c-newlook__x" onClick={hide} aria-label="Hide this message">
        ×
      </button>
    </div>
  )
}
