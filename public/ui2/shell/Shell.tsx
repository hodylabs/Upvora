import React, { createContext, useContext, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Trans } from "@lingui/react/macro"
import { uploadedImageURL } from "@fider/services"
import { useFider } from "@fider/hooks"
import { applyTheme } from "../lib/theme"
import { NotificationsBadge } from "../components/NotificationsBadge"
import { ModerationBadge } from "../components/ModerationBadge"
import { URL_CHANGE_EVENT } from "../lib/nav"

// The new UI's app shell: top bar (site, account, theme), optional site banner,
// sidebar (views and products; behind a menu button on phones), the page, footer.
// Pages fill the main slot. Any page can add to the end of the sidebar with
// <SidebarSlot>, e.g. the board's Vora briefing.

const SidebarSlotContext = createContext<HTMLElement | null>(null)

export const SidebarSlot = (props: { children: React.ReactNode }) => {
  const el = useContext(SidebarSlotContext)
  return el ? createPortal(props.children, el) : null
}

// The current path and query. Pages that change the query with replaceState fire
// URL_CHANGE_EVENT so the sidebar's aria-current stays right.
const readLocation = () => ({ path: location.pathname, params: new URLSearchParams(location.search) })
const useLocation = () => {
  const [loc, setLoc] = useState(readLocation)
  useEffect(() => {
    const update = () => setLoc(readLocation())
    window.addEventListener(URL_CHANGE_EVENT, update)
    window.addEventListener("popstate", update)
    return () => {
      window.removeEventListener(URL_CHANGE_EVENT, update)
      window.removeEventListener("popstate", update)
    }
  }, [])
  return loc
}

type Theme = "light" | "dark"

const currentTheme = (): Theme => (document.body.getAttribute("data-theme") === "dark" ? "dark" : "light")

const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(currentTheme)
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

const AccountMenu = () => {
  const fider = useFider()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  if (!fider.session.isAuthenticated) {
    return (
      <a className="u2-btn u2-btn--primary" href="/signin">
        <Trans id="ui2.shell.signin">Sign in</Trans>
      </a>
    )
  }

  const user = fider.session.user
  return (
    <div className="u2-menu" ref={ref}>
      <button type="button" className="u2-avatarbtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <img src={user.avatarURL} alt="" width={28} height={28} />
        <span className="u2-avatarbtn__name">{user.name}</span>
      </button>
      {open && (
        <ul className="u2-menu__list u2-panel" role="menu">
          <li role="none">
            <a role="menuitem" href="/settings">
              <Trans id="ui2.shell.settings">My settings</Trans>
            </a>
          </li>
          <li role="none">
            <a role="menuitem" href="/notifications">
              <Trans id="ui2.shell.notifications">Notifications</Trans>
            </a>
          </li>
          {user.isCollaborator && (
            <li role="none">
              <a role="menuitem" href="/admin">
                <Trans id="ui2.shell.admin">Site settings</Trans>
              </a>
            </li>
          )}
          <li role="none">
            <a role="menuitem" href="/signout">
              <Trans id="menu.signout">Sign out</Trans>
            </a>
          </li>
        </ul>
      )}
    </div>
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

const Sidebar = (props: { id: string; open: boolean; slotRef: (el: HTMLElement | null) => void }) => {
  const fider = useFider()
  const { path, params } = useLocation()
  const signedIn = fider.session.isAuthenticated
  const products = (fider.session.tenant.products || []).filter((p) => p.isActive)
  // Same rule as classic's header: staff only, when the scorecard is on.
  const showScorecard =
    fider.session.tenant.isScorecardEnabled && fider.session.isAuthenticated && (fider.session.user.isCollaborator || fider.session.user.isAdministrator)
  const link = (href: string, label: React.ReactNode, current = path === href) => (
    <li>
      <a href={href} aria-current={current ? "page" : undefined}>
        {label}
      </a>
    </li>
  )
  // Board views share "/" and differ by query; "All ideas" is current with neither on.
  const myVotes = path === "/" && params.get("myvotes") === "true"
  const myPosts = path === "/" && params.get("myposts") === "true"
  return (
    <nav id={props.id} className={`u2-side${props.open ? " is-open" : ""}`} aria-label="Board">
      <h2 className="u2-side__h">
        <Trans id="ui2.shell.views">Views</Trans>
      </h2>
      <ul className="u2-side__list">
        {link("/", <Trans id="ui2.shell.allideas">All ideas</Trans>, path === "/" && !myVotes && !myPosts)}
        {signedIn && link("/?myvotes=true", <Trans id="ui2.shell.myvotes">My votes</Trans>, myVotes)}
        {signedIn && link("/?myposts=true", <Trans id="ui2.shell.myposts">My ideas</Trans>, myPosts)}
        {link("/roadmap", <Trans id="ui2.shell.roadmap">Roadmap</Trans>)}
        {showScorecard && link("/scorecard", <Trans id="header.nav.scorecard">Scorecard</Trans>)}
      </ul>
      {products.length > 0 && (
        <>
          <h2 className="u2-side__h">
            <Trans id="ui2.shell.products">Products</Trans>
          </h2>
          <ul className="u2-side__list">{products.map((p) => link(`/p/${p.slug}`, p.name))}</ul>
        </>
      )}
      <div ref={props.slotRef} className="u2-side__extra" />
    </nav>
  )
}

export const Shell = (props: { children: React.ReactNode }) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const [menuOpen, setMenuOpen] = useState(false)
  const [slotEl, setSlotEl] = useState<HTMLElement | null>(null)
  const logo = uploadedImageURL(tenant.logoBlobKey, 64)

  return (
    <div className="u2-app">
      <a className="u2-skip" href="#u2-main">
        <Trans id="ui2.shell.skip">Skip to content</Trans>
      </a>
      <Notices />
      <header className="u2-top">
        <button
          type="button"
          className="u2-iconbtn u2-top__menu"
          aria-label="Menu"
          aria-expanded={menuOpen}
          aria-controls="u2-side"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <a className="u2-brand" href="/">
          {logo && <img src={logo} alt="" width={28} height={28} />}
          <span>{tenant.name}</span>
        </a>
        <div className="u2-top__end">
          <ModerationBadge />
          <ThemeToggle />
          <NotificationsBadge />
          <AccountMenu />
        </div>
      </header>
      <Banner />
      <div className="u2-body">
        <Sidebar id="u2-side" open={menuOpen} slotRef={setSlotEl} />
        <main id="u2-main" className="u2-main" tabIndex={-1}>
          <SidebarSlotContext.Provider value={slotEl}>{props.children}</SidebarSlotContext.Provider>
        </main>
      </div>
      <footer className="u2-foot">
        <a href="https://upvora.dev" rel="noopener" target="_blank">
          <Trans id="ui2.shell.powered">Powered by Upvora</Trans>
        </a>
        <span className="u2-mono">{fider.settings.version}</span>
      </footer>
    </div>
  )
}
