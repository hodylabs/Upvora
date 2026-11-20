import "./admin.css"

import React, { useId } from "react"
import { Trans } from "@lingui/react/macro"
import { useFider } from "@fider/hooks"
import { adminNavItems } from "./nav"
import { SystemBox } from "./SystemBox"

// Every admin page renders inside this: the admin nav on the inline-start side
// (classic's items and gating, see nav.ts), the page title and subtitle, and the
// content panel. Administrators also get the System box under the nav, as classic.

interface AdminLayoutProps {
  // The nav item that is current (classic's SideMenu names: "general", "users", ...).
  name: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  // Pages that lay out their own sections (lists with panels) skip the default padding.
  bare?: boolean
  children: React.ReactNode
}

export const AdminLayout = (props: AdminLayoutProps) => {
  const fider = useFider()
  const items = adminNavItems(fider)
  const admin = fider.session.isAuthenticated && fider.session.user.isAdministrator
  return (
    <div className="u2-admin">
      <span className="u2-admin__eyebrow">
        <Trans id="ui2.admin.eyebrow">Site settings</Trans>
      </span>
      <div className="u2-panel u2-admin__frame">
        <nav className="u2-admin__nav" aria-label="Site settings">
          <ul>
            {items.map((i) => (
              <li key={i.name}>
                <a href={i.href} aria-current={i.name === props.name ? "page" : undefined}>
                  {i.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className={props.bare ? "u2-admin__content u2-admin__content--bare" : "u2-admin__content"}>
          <header className="u2-admin__head">
            <h1 className="u2-admin__title">{props.title}</h1>
            {props.subtitle && <p className="u2-admin__sub">{props.subtitle}</p>}
          </header>
          {props.children}
        </div>
        {admin && (
          <div className="u2-admin__sys">
            <SystemBox />
          </div>
        )}
      </div>
    </div>
  )
}

// A titled group of fields inside a page (e.g. "Email authentication", "OAuth providers").
export const AdminSection = (props: { title: React.ReactNode; lede?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) => {
  const id = useId()
  return (
    <section className="u2-admin__sect" aria-labelledby={id}>
      <div className="u2-admin__secthead">
        <div>
          <h2 id={id} className="u2-admin__h2">
            {props.title}
          </h2>
          {props.lede && <p className="u2-admin__sub">{props.lede}</p>}
        </div>
        {props.actions && <div className="u2-row">{props.actions}</div>}
      </div>
      {props.children}
    </section>
  )
}
