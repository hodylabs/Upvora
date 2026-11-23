import React, { useEffect, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { applyTheme, followSystemTheme } from "../lib/theme"
import { NotificationsBadge } from "../components/NotificationsBadge"
import { ModerationBadge } from "../components/ModerationBadge"
import { URL_CHANGE_EVENT, signInHref } from "../lib/nav"
import { useIsStaff, useTeamView } from "../lib/teamView"
import { Menu, MenuItem } from "../components/Menu"
import { requestShare } from "../lib/share"

// The new UI's app shell: a sticky top bar (brand, product switcher, section tabs,
// team view, badges, theme, account), optional site banner, the page, footer.
// Pages fill the main slot. There is no sidebar.

// The current path. Pages that change the query with replaceState fire URL_CHANGE_EVENT.
const useLocationPath = () => {
  const [path, setPath] = useState(() => location.pathname)
  useEffect(() => {
    const update = () => setPath(location.pathname)
    window.addEventListener(URL_CHANGE_EVENT, update)
    window.addEventListener("popstate", update)
    return () => {
      window.removeEventListener(URL_CHANGE_EVENT, update)
      window.removeEventListener("popstate", update)
    }
  }, [])
  return path
}

type Theme = "light" | "dark"

const currentTheme = (): Theme => (document.body.getAttribute("data-theme") === "dark" ? "dark" : "light")

const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  const siteDefault = useFider().session.tenant?.defaultTheme
  useEffect(() => followSystemTheme(siteDefault), [siteDefault])
  useEffect(() => {
    const sync = () => setTheme(currentTheme())
    window.addEventListener("ui2:themechange", sync)
    return () => window.removeEventListener("ui2:themechange", sync)
  }, [])
  // A quick switch to the opposite of what is showing; "system" lives in My settings.
  const toggle = () => applyTheme(theme === "dark" ? "light" : "dark")
  return (
    <button type="button" className="u2-iconbtn" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}>
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  )
}

const Chevron = () => (
  <svg className="u2-pswitch__chev" viewBox="0 0 24 24" aria-hidden="true">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

const Dot = (props: { color?: string }) => (
  <span className="u2-dot" style={props.color ? ({ "--u-dot": props.color } as React.CSSProperties) : undefined} aria-hidden="true" />
)

// Which board you are on: All products, or one product's board (/p/<slug>).
const ProductSwitch = (props: { path: string }) => {
  const fider = useFider()
  const products = (fider.session.tenant.products || []).filter((p) => p.isActive)
  if (products.length === 0) return null
  const slug = props.path.startsWith("/p/") ? props.path.slice(3).split("/")[0] : ""
  const current = products.find((p) => p.slug === slug)
  const all = <Trans id="ui2.shell.allproducts">All products</Trans>
  const items: MenuItem[] = [
    {
      key: "all",
      href: "/",
      current: props.path === "/",
      label: (
        <>
          <Dot color="var(--u-muted)" />
          {all}
        </>
      ),
    },
    { key: "sep", kind: "divider", label: null },
    ...products.map((p) => ({
      key: `p-${p.slug}`,
      href: `/p/${p.slug}`,
      current: p === current,
      label: (
        <>
          <Dot color={p.color || undefined} />
          {p.name}
        </>
      ),
    })),
  ]
  return (
    <Menu
      className="u2-menu u2-pswitch"
      triggerClassName="u2-pswitch__btn"
      listClassName="u2-menu__list u2-menu__list--start u2-panel"
      items={items}
      trigger={
        <>
          <Dot color={current ? current.color || undefined : "var(--u-muted)"} />
          <span className="u2-pswitch__name">{current ? current.name : all}</span>
          <Chevron />
        </>
      }
    />
  )
}

// Section tabs, shared by the desktop tab row and the phone menu.
const useTabs = (path: string) => {
  const fider = useFider()
  const staff = useIsStaff()
  // Same rule as classic's header: staff only, when the scorecard is on.
  const showScorecard = fider.session.tenant.isScorecardEnabled && staff
  return [
    { key: "ideas", href: "/", current: path === "/" || path.startsWith("/p/"), label: <Trans id="ui2.shell.ideas">Ideas</Trans> },
    { key: "roadmap", href: "/roadmap", current: path === "/roadmap", label: <Trans id="ui2.shell.roadmap">Roadmap</Trans> },
    ...(showScorecard
      ? [{ key: "scorecard", href: "/scorecard", current: path === "/scorecard", label: <Trans id="header.nav.scorecard">Scorecard</Trans> }]
      : []),
  ]
}

const teamViewHint = () => i18n._({ id: "ui2.shell.teamview.hint", message: "Show pending ideas, voters and team notes" })

const TeamSwitch = () => {
  const [on, setOn] = useTeamView()
  if (!useIsStaff()) return null
  return (
    <button type="button" className="u2-teamsw" role="switch" aria-checked={on} title={teamViewHint()} onClick={() => setOn(!on)}>
      <span className="u2-teamsw__track" aria-hidden="true" />
      <Trans id="ui2.shell.teamview">Team view</Trans>
    </button>
  )
}

// Phones: the tabs and the team switch live behind the menu button.
const PhoneMenu = (props: { path: string }) => {
  const tabs = useTabs(props.path)
  const staff = useIsStaff()
  const [on, setOn] = useTeamView()
  const items: MenuItem[] = [
    ...tabs,
    ...(staff
      ? [
          { key: "sep", kind: "divider" as const, label: null },
          { key: "teamview", checked: on, onSelect: () => setOn(!on), label: <Trans id="ui2.shell.teamview">Team view</Trans> },
        ]
      : []),
  ]
  return (
    <Menu
      className="u2-menu u2-top__menu"
      triggerClassName="u2-iconbtn"
      triggerLabel="Menu"
      items={items}
      trigger={
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      }
    />
  )
}

const AccountMenu = () => {
  const fider = useFider()
  const staff = useIsStaff()

  if (!fider.session.isAuthenticated) {
    return (
      <a className="u2-btn u2-top__signin" href={signInHref()}>
        <Trans id="ui2.shell.signin">Sign in</Trans>
      </a>
    )
  }

  const user = fider.session.user
  const items: MenuItem[] = [
    { key: "yours", kind: "heading", label: <Trans id="ui2.shell.yourstuff">your stuff</Trans> },
    { key: "myvotes", href: "/?myvotes=true", label: <Trans id="ui2.shell.myvotes">My votes</Trans> },
    { key: "myposts", href: "/?myposts=true", label: <Trans id="ui2.shell.myposts">My ideas</Trans> },
    { key: "notifications", href: "/notifications", label: <Trans id="ui2.shell.notifications">Notifications</Trans> },
    { key: "sep1", kind: "divider", label: null },
    { key: "settings", href: "/settings", label: <Trans id="ui2.shell.settings">My settings</Trans> },
    ...(staff ? [{ key: "admin", href: "/admin", label: <Trans id="ui2.shell.admin">Site settings</Trans> }] : []),
    { key: "sep2", kind: "divider", label: null },
    { key: "signout", href: "/signout", label: <Trans id="menu.signout">Sign out</Trans> },
  ]
  return (
    <Menu
      triggerClassName="u2-iconbtn u2-avatarbtn"
      triggerLabel={user.name}
      items={items}
      trigger={<img src={user.avatarURL} alt="" width={28} height={28} />}
    />
  )
}

const Banner = () => {
  const fider = useFider()
  const t = fider.session.tenant
  if (!t.siteBannerEnabled || !t.siteBannerMessage) return null
  return (
    <div className={`u2-banner u2-banner--${t.siteBannerVariant || "info"}`} role="status">
      {t.siteBannerMessage}
    </div>
  )
}

const Notices = () => {
  const fider = useFider()
  return (
    <>
      {!fider.isProduction() && (
        <div className="u2-notice">
          <Trans id="ui2.shell.dev">Development environment</Trans>
        </div>
      )}
      {fider.isReadOnly && (
        <div className="u2-notice u2-notice--warn" role="status">
          <Trans id="ui2.shell.readonly">This site is in read-only mode.</Trans>
        </div>
      )}
    </>
  )
}

// Share from any page; the board has its own share box in the welcome card.
const NewIdea = () => {
  const fider = useFider()
  if (fider.isReadOnly || fider.session.page === "Home/Home.page") return null
  return (
    <button type="button" className="u2-btn u2-btn--primary u2-top__new" onClick={() => requestShare("")}>
      <svg className="u2-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <Trans id="ui2.shell.newidea">New idea</Trans>
    </button>
  )
}

export const Shell = (props: { children: React.ReactNode }) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const path = useLocationPath()
  const tabs = useTabs(path)
  const [teamView] = useTeamView()
  const logo = uploadedImageURL(tenant.logoBlobKey, 64)
  // Admin pages bring their own left nav inside the main slot.
  const admin = (fider.session.page || "").startsWith("Administration/")

  // A body class lets page CSS reveal staff-only bits without reading the hook.
  useEffect(() => {
    document.body.classList.toggle("u2-team", teamView)
  }, [teamView])

  return (
    <div className="u2-app">
      <a className="u2-skip" href="#u2-main">
        <Trans id="ui2.shell.skip">Skip to content</Trans>
      </a>
      <Notices />
      <header className="u2-top">
        <div className="u2-top__in">
          <a className="u2-brand" href="/">
            {logo && <img src={logo} alt="" width={26} height={26} />}
            <span>{tenant.name}</span>
          </a>
          <ProductSwitch path={path} />
          <nav className="u2-tabs" aria-label="Sections">
            {tabs.map((t) => (
              <a key={t.key} href={t.href} aria-current={t.current ? "page" : undefined}>
                {t.label}
              </a>
            ))}
          </nav>
          <div className="u2-top__end">
            <NewIdea />
            <TeamSwitch />
            <ModerationBadge />
            <NotificationsBadge />
            <ThemeToggle />
            <AccountMenu />
            <PhoneMenu path={path} />
          </div>
        </div>
      </header>
      <Banner />
      <div className={admin ? "u2-body is-admin" : "u2-body"}>
        <main id="u2-main" className="u2-main" tabIndex={-1}>
          {props.children}
          <footer className="u2-foot">
            <a href="https://upvora.dev" rel="noopener" target="_blank">
              <Trans id="ui2.shell.powered">Powered by Upvora</Trans>
            </a>
            <span className="u2-mono">{fider.settings.version}</span>
          </footer>
        </main>
      </div>
    </div>
  )
}
