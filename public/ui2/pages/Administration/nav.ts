import { i18n } from "@lingui/core"
import { Fider } from "@fider/services"

// The admin nav: classic's SideMenu items, each gated the same way, grouped into sections.
// Collaborators see General (read-only), Tags, Scorecard and Invitations; the rest
// is admin-only. Billing only where billing is on, Danger zone only in multi-host
// mode. Moderation is not in classic's side menu (its header shows a badge); here
// it is an item, gated exactly like that badge: paid plan, moderation on, staff.
// The server enforces every one of these; this only hides links that would 403.

export type AdminNavGroup = "site" | "people" | "board" | "integrations" | "data"

export interface AdminNavItem {
  name: string
  href: string
  title: string
  group: AdminNavGroup
}

type FiderLike = Pick<typeof Fider, "session" | "settings" | "isSingleHostMode">

// Section headers of the nav, in display order.
export const adminNavGroups = (): { key: AdminNavGroup; title: string }[] => {
  const t = (id: string, message: string) => i18n._({ id, message })
  return [
    { key: "site", title: t("ui2.admin.navgroup.site", "site") },
    { key: "people", title: t("ui2.admin.navgroup.people", "people") },
    { key: "board", title: t("ui2.admin.navgroup.board", "board") },
    { key: "integrations", title: t("ui2.admin.navgroup.integrations", "integrations") },
    { key: "data", title: t("ui2.admin.navgroup.data", "data and plan") },
  ]
}

export const adminNavItems = (fider: FiderLike): AdminNavItem[] => {
  const admin = fider.session.isAuthenticated && fider.session.user.isAdministrator
  const t = (id: string, message: string) => i18n._({ id, message })
  const items: (AdminNavItem | false)[] = [
    { group: "site", name: "general", href: "/admin", title: t("ui2.admin.nav.general", "General") },
    admin && { group: "site", name: "privacy", href: "/admin/privacy", title: t("ui2.admin.nav.privacy", "Privacy") },
    admin && { group: "site", name: "theme", href: "/admin/theme", title: t("ui2.admin.nav.theme", "Theme") },
    admin && { group: "site", name: "banner", href: "/admin/banner", title: t("ui2.admin.nav.banner", "Banner") },
    admin && { group: "site", name: "advanced", href: "/admin/advanced", title: t("ui2.admin.nav.advanced", "Advanced") },
    admin && { group: "people", name: "users", href: "/admin/users", title: t("ui2.admin.nav.users", "Users") },
    { group: "people", name: "invitations", href: "/admin/invitations", title: t("ui2.admin.nav.invitations", "Invitations") },
    admin && { group: "people", name: "authentication", href: "/admin/authentication", title: t("ui2.admin.nav.authentication", "Authentication") },
    fider.session.showModerationControls && {
      group: "people",
      name: "moderation",
      href: "/admin/moderation",
      title: t("ui2.admin.nav.moderation", "Moderation"),
    },
    { group: "board", name: "tags", href: "/admin/tags", title: t("ui2.admin.nav.tags", "Tags") },
    admin && { group: "board", name: "products", href: "/admin/products", title: t("ui2.admin.nav.products", "Products") },
    admin && { group: "board", name: "statuses", href: "/admin/statuses", title: t("ui2.admin.nav.statuses", "Statuses") },
    { group: "board", name: "scorecard-settings", href: "/admin/scorecard-settings", title: t("ui2.admin.nav.scorecard", "Scorecard") },
    admin && { group: "integrations", name: "ai", href: "/admin/ai", title: t("ui2.admin.nav.ai", "AI") },
    admin && { group: "integrations", name: "mcp", href: "/admin/mcp", title: t("ui2.admin.nav.mcp", "MCP") },
    admin && { group: "integrations", name: "webhooks", href: "/admin/webhooks", title: t("ui2.admin.nav.webhooks", "Webhooks") },
    admin && fider.settings.isBillingEnabled && { group: "data", name: "billing", href: "/admin/billing", title: t("ui2.admin.nav.billing", "Billing") },
    admin && { group: "data", name: "export", href: "/admin/export", title: t("ui2.admin.nav.export", "Export") },
    admin &&
      !fider.isSingleHostMode() && { group: "data", name: "danger-zone", href: "/admin/danger-zone", title: t("ui2.admin.nav.dangerzone", "Danger Zone") },
  ]
  return items.filter((i): i is AdminNavItem => !!i)
}
