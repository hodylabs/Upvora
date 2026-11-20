import "../../components/account/account.css"
import React, { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { actions, formatDate, timeSince } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Notification } from "@fider/models"
import { Button } from "../../components/form"
import { Markdown } from "../../components/content/Markdown"
import { NOTIFICATIONS_READ_EVENT } from "../../components/NotificationsBadge"

interface MyNotificationsPageProps {
  notifications: Notification[]
}

export const splitByRead = (list: Notification[]) => ({
  unread: list.filter((n) => !n.read),
  read: list.filter((n) => n.read),
})

const Item = ({ n, unread }: { n: Notification; unread: boolean }) => {
  const fider = useFider()
  const date = new Date(n.createdAt)
  return (
    <li className={unread ? "u2-nlist__item u2-nlist__item--unread" : "u2-nlist__item"}>
      {/* /notifications/:id marks it read on the server and redirects to what it is about. */}
      <a className="u2-nlist__link" href={`/notifications/${n.id}`}>
        <Markdown text={n.title} inline />
      </a>
      <time className="u2-nlist__when" dateTime={n.createdAt} title={formatDate(fider.currentLocale, date)}>
        {timeSince(fider.currentLocale, new Date(), date)}
      </time>
    </li>
  )
}

const MyNotificationsPage = (props: MyNotificationsPageProps) => {
  const [list, setList] = useState<Notification[]>(props.notifications || [])
  const [busy, setBusy] = useState(false)
  const { unread, read } = splitByRead(list)

  const markAllAsRead = async () => {
    setBusy(true)
    const result = await actions.markAllAsRead()
    setBusy(false)
    if (result.ok) {
      setList((l) => l.map((n) => ({ ...n, read: true })))
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT))
    }
  }

  return (
    <div className="u2-page">
      <header className="u2-page__head">
        <h1 className="u2-page__title">
          <Trans id="mynotifications.page.title">Notifications</Trans>
        </h1>
        <p className="u2-page__sub">
          <Trans id="mynotifications.page.subtitle">Stay up to date with what&apos;s happening</Trans>
        </p>
      </header>

      <section className="u2-panel u2-nlist-panel" aria-labelledby="u2-n-unread">
        <div className="u2-nlist__head">
          <h2 id="u2-n-unread">
            <Trans id="label.unread">Unread</Trans> <span className="u2-mono u2-muted">{unread.length}</span>
          </h2>
          {unread.length > 0 && (
            <Button small variant="ghost" onClick={markAllAsRead} loading={busy}>
              <Trans id="action.markallasread">Mark All as Read</Trans>
            </Button>
          )}
        </div>
        {unread.length > 0 ? (
          <ul className="u2-nlist">
            {unread.map((n) => (
              <Item key={n.id} n={n} unread />
            ))}
          </ul>
        ) : (
          <p className="u2-nlist__empty">
            <Trans id="mynotifications.message.nounread">No unread notifications.</Trans>
          </p>
        )}
      </section>

      {read.length > 0 && (
        <section className="u2-panel u2-nlist-panel" aria-labelledby="u2-n-read">
          <div className="u2-nlist__head">
            <h2 id="u2-n-read">
              <Trans id="mynotifications.label.readrecently">Read on last 30 days.</Trans>
            </h2>
          </div>
          <ul className="u2-nlist">
            {read.map((n) => (
              <Item key={n.id} n={n} unread={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default MyNotificationsPage
