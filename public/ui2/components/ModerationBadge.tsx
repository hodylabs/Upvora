import "./ui.css"

import React, { useEffect, useState } from "react"
import { i18n } from "@lingui/core"
import { http } from "@fider/services"
import { useFider } from "@fider/hooks"

// The pending moderation count, linking to the queue. Same source as classic's
// header ModerationIndicator (/_api/admin/moderation/count), shown only to staff on a
// paid site with moderation on (the endpoint is behind RequirePro; the server
// decides, this only avoids a request that would be refused). Hidden at zero.
export const ModerationBadge = () => {
  const fider = useFider()
  const [count, setCount] = useState(0)
  const show = fider.session.showModerationControls

  useEffect(() => {
    if (!show) return
    let live = true
    http
      .get<{ count: number }>("/_api/admin/moderation/count")
      .then((res) => live && res.ok && setCount(res.data?.count || 0))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [show])

  if (!show || count <= 0) return null
  const label = i18n._({ id: "ui2.moderation.badge", message: "{count} ideas and comments waiting for moderation", values: { count } })
  return (
    <a className="u2-iconbtn u2-modbadge" href="/admin/moderation" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
      </svg>
      <span className="u2-modbadge__n" aria-hidden="true">
        {count > 99 ? "99+" : count}
      </span>
    </a>
  )
}
