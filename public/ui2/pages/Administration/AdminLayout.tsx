import "./admin.css"

import React, { useId } from "react"
import { i18n } from "@lingui/core"
import { useFider } from "@fider/hooks"
import { adminNavGroups, adminNavItems } from "./nav"
import { SystemBox } from "./SystemBox"

// Every admin page renders inside this: the admin nav as the left sidebar, grouped
// by section (classic's items and gating, see nav.ts), with the System box under it
// for administrators; on phones the nav is a select at the top. Then the page title,
// a one-line description and the page's panels.

interface AdminLayoutProps {
  // The nav item that is current (classic's SideMenu names: "general", "users", ...).
  name: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  // Pages built around a table get a wider column than forms.
  wide?: boolean
  children: React.ReactNode
}

export const AdminLayout = (props: AdminLayoutProps) => {
  const fider = useFider()
  const items = adminNavItems(fider)
  const groups = adminNavGroups().filter((g) => items.some((i) => i.group === g.key))
  const current = items.find((i) => i.name === props.name)
  const admin = fider.session.isAuthenticated && fider.session.user.isAdministrator
  const navLabel = i18n._({ id: "ui2.admin.eyebrow", message: "Site settings" })
  return (
    <div className="u2-admin">
      <aside className="u2-admin__side">
        <nav className="u2-admin__nav" aria-label={navLabel}>
          {groups.map((g) => (
            <div key={g.key} className="u2-admin__navgroup">
              <span id={`u2-admin-nav-${g.key}`} className="u2-admin__navh">
                {g.title}
              </span>
              <ul aria-labelledby={`u2-admin-nav-${g.key}`}>
                {items
                  .filter((i) => i.group === g.key)
                  .map((i) => (
                    <li key={i.name}>
                      <a href={i.href} aria-current={i.name === props.name ? "page" : undefined}>
                        {i.title}
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>
        {admin && (
          <div className="u2-admin__sys">
            <SystemBox />
          </div>
        )}
      </aside>
      <div className="u2-admin__jump">
        <label className="u2-vh" htmlFor="u2-admin-jump">
          {navLabel}
        </label>
        <select id="u2-admin-jump" className="u2-ctl" value={current?.href ?? ""} onChange={(e) => location.assign(e.target.value)}>
          {!current && <option value="">{navLabel}</option>}
          {groups.map((g) => (
            <optgroup key={g.key} label={g.title}>
              {items
                .filter((i) => i.group === g.key)
                .map((i) => (
                  <option key={i.name} value={i.href}>
                    {i.title}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className={props.wide ? "u2-admin__content u2-admin__content--wide" : "u2-admin__content"}>
        <header className="u2-admin__head">
          <h1 className="u2-admin__title">{props.title}</h1>
          {props.subtitle && <p className="u2-admin__sub">{props.subtitle}</p>}
        </header>
        {props.children}
      </div>
    </div>
  )
}

// A panel of settings or a table inside a page (e.g. "Email authentication", "OAuth
// providers"). Without a title it is a plain panel; tone "danger" tints it red.
export const AdminSection = (props: {
  title?: React.ReactNode
  lede?: React.ReactNode
  actions?: React.ReactNode
  tone?: "danger"
  id?: string
  className?: string
  children: React.ReactNode
}) => {
  const id = useId()
  const cls = ["u2-admin__sect", props.tone && `u2-admin__sect--${props.tone}`, props.className].filter(Boolean).join(" ")
  return (
    <section id={props.id} className={cls} aria-labelledby={props.title ? id : undefined}>
      {props.title && (
        <div className="u2-admin__secthead">
          <div>
            <h2 id={id} className="u2-admin__h2">
              {props.title}
            </h2>
            {props.lede && <p className="u2-admin__sub">{props.lede}</p>}
          </div>
          {props.actions && <div className="u2-row">{props.actions}</div>}
        </div>
      )}
      <div className="u2-admin__sectbody">{props.children}</div>
    </section>
  )
}
