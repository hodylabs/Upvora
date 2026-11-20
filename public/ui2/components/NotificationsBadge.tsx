import "./account/account.css"
import React, { useEffect, useState } from "react"
import { i18n } from "@lingui/core"
import { actions } from "@fider/services"
import { useFider } from "@fider/hooks"

// Fired by the notifications page after "Mark all as read" so the badge clears at once.
export const NOTIFICATIONS_READ_EVENT = "ui2:notifications-read"

// A bell linking to /notifications with the unread count, for the shell's top bar
// (signed-in people only). Same source as classic's header: /_api/notifications/unread/total.
export const NotificationsBadge = () => {
  const fider = useFider()
  const signedIn = fider.session.isAuthenticated
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!signedIn) return
    let live = true
    actions.getTotalUnreadNotifications().then((result) => {
      if (live && result.ok) setTotal(result.data)
    })
    const cleared = () => setTotal(0)
    window.addEventListener(NOTIFICATIONS_READ_EVENT, cleared)
    return () => {
      live = false
      window.removeEventListener(NOTIFICATIONS_READ_EVENT, cleared)
    }
  }, [signedIn])

  if (!signedIn) return null

  const label =
    total > 0
      ? i18n._({ id: "ui2.notifications.badge.unread", values: { total }, message: "Notifications, {total} unread" })
      : i18n._({ id: "ui2.notifications.badge", message: "Notifications" })

  return (
    <a className="u2-iconbtn u2-bell" href="/notifications" aria-label={label} title={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
      </svg>
      {total > 0 && (
        <span className="u2-bell__n" aria-hidden="true">
          {total > 99 ? "99+" : total}
        </span>
      )}
    </a>
  )
}
