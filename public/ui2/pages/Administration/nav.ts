import { i18n } from "@lingui/core"
import { Fider } from "@fider/services"

// The admin nav: classic's SideMenu order and items, each gated the same way.
// Collaborators see General (read-only), Tags, Scorecard and Invitations; the rest
// is admin-only. Billing only where billing is on, Danger zone only in multi-host
// mode. Moderation is not in classic's side menu (its header shows a badge); here
// it is an item, gated exactly like that badge: paid plan, moderation on, staff.
// The server enforces every one of these; this only hides links that would 403.

export interface AdminNavItem {
  name: string
  href: string
  title: string
}

type FiderLike = Pick<typeof Fider, "session" | "settings" | "isSingleHostMode">

export const adminNavItems = (fider: FiderLike): AdminNavItem[] => {
  const admin = fider.session.isAuthenticated && fider.session.user.isAdministrator
  const t = (id: string, message: string) => i18n._({ id, message })
  const items: (AdminNavItem | false)[] = [
    { name: "general", href: "/admin", title: t("ui2.admin.nav.general", "General") },
    admin && { name: "privacy", href: "/admin/privacy", title: t("ui2.admin.nav.privacy", "Privacy") },
    admin && { name: "users", href: "/admin/users", title: t("ui2.admin.nav.users", "Users") },
    { name: "tags", href: "/admin/tags", title: t("ui2.admin.nav.tags", "Tags") },
    admin && { name: "theme", href: "/admin/theme", title: t("ui2.admin.nav.theme", "Theme") },
    admin && { name: "ai", href: "/admin/ai", title: t("ui2.admin.nav.ai", "AI") },
    admin && { name: "mcp", href: "/admin/mcp", title: t("ui2.admin.nav.mcp", "MCP") },
    admin && { name: "products", href: "/admin/products", title: t("ui2.admin.nav.products", "Products") },
    admin && { name: "statuses", href: "/admin/statuses", title: t("ui2.admin.nav.statuses", "Statuses") },
    { name: "scorecard-settings", href: "/admin/scorecard-settings", title: t("ui2.admin.nav.scorecard", "Scorecard") },
    admin && { name: "banner", href: "/admin/banner", title: t("ui2.admin.nav.banner", "Banner") },
    { name: "invitations", href: "/admin/invitations", title: t("ui2.admin.nav.invitations", "Invitations") },
    fider.session.showModerationControls && { name: "moderation", href: "/admin/moderation", title: t("ui2.admin.nav.moderation", "Moderation") },
    admin && { name: "authentication", href: "/admin/authentication", title: t("ui2.admin.nav.authentication", "Authentication") },
    admin && { name: "advanced", href: "/admin/advanced", title: t("ui2.admin.nav.advanced", "Advanced") },
    admin && fider.settings.isBillingEnabled && { name: "billing", href: "/admin/billing", title: t("ui2.admin.nav.billing", "Billing") },
    admin && { name: "webhooks", href: "/admin/webhooks", title: t("ui2.admin.nav.webhooks", "Webhooks") },
    admin && { name: "export", href: "/admin/export", title: t("ui2.admin.nav.export", "Export") },
    admin && !fider.isSingleHostMode() && { name: "danger-zone", href: "/admin/danger-zone", title: t("ui2.admin.nav.dangerzone", "Danger Zone") },
  ]
  return items.filter((i): i is AdminNavItem => !!i)
}
