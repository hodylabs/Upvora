import "./groupA.css"

import React, { useCallback, useEffect, useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { User, UserRole, UserStatus } from "@fider/models"
import { actions, Fider, http, Result } from "@fider/services"
import { Button, Select, TextInput } from "../../../components/form"
import { Avatar } from "../../../components/feedback"
import { AdminLayout } from "../AdminLayout"

// Members: search by name or email (debounced), filter by level, pages of 10, and
// per user one "level" (administrator, collaborator, trusted member, member,
// blocked) that maps to role, block and trust calls exactly as classic.

interface ManageMembersPageProps {
  users: User[]
  totalPages: number
}

export type Level = "administrator" | "collaborator" | "trusted" | "member" | "blocked"
const LEVELS: Level[] = ["administrator", "collaborator", "trusted", "member", "blocked"]
const PAGE_SIZE = 10

const levelLabel = (l: Level, plural = false): string =>
  ({
    administrator: plural
      ? i18n._({ id: "ui2.admin.members.admins", message: "Administrators" })
      : i18n._({ id: "ui2.admin.members.admin", message: "Administrator" }),
    collaborator: plural
      ? i18n._({ id: "ui2.admin.members.collaborators", message: "Collaborators" })
      : i18n._({ id: "ui2.admin.members.collaborator", message: "Collaborator" }),
    trusted: plural
      ? i18n._({ id: "ui2.admin.members.trustedplural", message: "Trusted members" })
      : i18n._({ id: "ui2.admin.members.trusted", message: "Trusted member" }),
    member: plural ? i18n._({ id: "ui2.admin.members.members", message: "Members" }) : i18n._({ id: "ui2.admin.members.member", message: "Member" }),
    blocked: i18n._({ id: "ui2.admin.members.blocked", message: "Blocked" }),
  })[l]

export const levelOf = (user: User): Level => {
  if (user.status === UserStatus.Blocked) return "blocked"
  if (user.role === UserRole.Administrator) return "administrator"
  if (user.role === UserRole.Collaborator) return "collaborator"
  return user.isTrusted ? "trusted" : "member"
}

// What a level means for a user, and the calls (in order) to get there.
// Blocked users are demoted to member so they drop out of staff lists.
export const planLevel = (user: User, level: Level) => {
  const role = level === "administrator" ? UserRole.Administrator : level === "collaborator" ? UserRole.Collaborator : UserRole.Visitor
  const status = level === "blocked" ? UserStatus.Blocked : UserStatus.Active
  const isTrusted = level === "member" ? false : level === "trusted" ? true : user.isTrusted
  const steps: (() => Promise<Result>)[] = []
  if (user.role !== role) steps.push(() => actions.changeUserRole(user.id, role))
  if (user.status !== status) steps.push(() => (status === UserStatus.Blocked ? actions.blockUser(user.id) : actions.unblockUser(user.id)))
  if (user.isTrusted !== isTrusted) steps.push(() => (isTrusted ? actions.trustUser(user.id) : actions.untrustUser(user.id)))
  return { role, status, isTrusted, steps }
}

export const usersURL = (query: string, level: Level | "all", page: number): string => {
  const params = new URLSearchParams()
  if (query) params.append("query", query)
  if (level !== "all") params.append("roles", level)
  params.append("page", page.toString())
  params.append("limit", PAGE_SIZE.toString())
  return `/api/v1/users?${params.toString()}`
}

const ManageMembersPage = (props: ManageMembersPageProps) => {
  const initial = new URLSearchParams(window.location.search)
  const [query, setQuery] = useState(initial.get("query") || "")
  const [level, setLevel] = useState<Level | "all">((initial.get("roles") as Level) || "all")
  const [users, setUsers] = useState<User[]>(props.users || [])
  const [page, setPage] = useState(parseInt(initial.get("page") || "1", 10) || 1)
  const [totalPages, setTotalPages] = useState(props.totalPages || 1)
  const [busy, setBusy] = useState<number | null>(null)
  const timer = useRef(0)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const reload = useCallback(async (q: string, l: Level | "all", p = 1) => {
    const res = await http.get<{ users: User[]; totalPages: number }>(usersURL(q, l, p)).catch(() => undefined)
    if (res?.ok && res.data) {
      setUsers(res.data.users || [])
      setTotalPages(res.data.totalPages)
      setPage(p)
    }
  }, [])

  const search = (q: string) => {
    setQuery(q)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => reload(q, level, 1), 300)
  }

  const filter = (l: Level | "all") => {
    setLevel(l)
    reload(query, l, 1)
  }

  const changeLevel = async (user: User, next: Level) => {
    const plan = planLevel(user, next)
    setBusy(user.id)
    for (const step of plan.steps) {
      const result = await step()
      if (!result.ok) {
        // Earlier steps may have succeeded, so show the user's real state.
        await reload(query, level, page)
        setBusy(null)
        return
      }
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...user, role: plan.role, status: plan.status, isTrusted: plan.isTrusted } : u)))
    setBusy(null)
  }

  const me = Fider.session.user

  return (
    <AdminLayout
      name="users"
      title={<Trans id="ui2.admin.members.title">Members</Trans>}
      subtitle={<Trans id="ui2.admin.members.sub">Manage your site administrators and collaborators</Trans>}
    >
      <TextInput
        name="query"
        type="search"
        label={<Trans id="ui2.admin.members.search">Search</Trans>}
        placeholder={i18n._({ id: "ui2.admin.members.searchph", message: "Search by name / email ..." })}
        value={query}
        onChange={search}
      />
      <Select
        name="roles"
        label={<Trans id="ui2.admin.members.role">Role</Trans>}
        value={level}
        onChange={(v) => filter(v as Level | "all")}
        options={[
          { value: "all", label: i18n._({ id: "ui2.admin.members.allroles", message: "All Roles" }) },
          ...LEVELS.map((l) => ({ value: l, label: levelLabel(l, true) })),
        ]}
      />

      <ul className="u2-alist u2-members" aria-live="polite">
        {users.map((u) => {
          const current = levelOf(u)
          return (
            <li key={u.id} data-user={u.id}>
              <Avatar name={u.name} src={u.avatarURL} size={24} />
              <div className="u2-alist__main">
                <strong>{u.name}</strong>
                <div className="u2-alist__meta" title={u.email}>
                  {u.email || <Trans id="ui2.admin.members.noemail">No email</Trans>}
                </div>
              </div>
              {me.id !== u.id && me.isAdministrator ? (
                <select
                  className="u2-ctl u2-members__level"
                  aria-label={i18n._({ id: "ui2.admin.members.levelfor", message: "Role for {name}", values: { name: u.name } })}
                  value={current}
                  disabled={busy === u.id}
                  onChange={(e) => changeLevel(u, e.target.value as Level)}
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {levelLabel(l)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className={`u2-chip u2-members__badge u2-members__badge--${current}`}>{levelLabel(current).toLowerCase()}</span>
              )}
            </li>
          )
        })}
        {users.length === 0 && (
          <li className="u2-alist__empty">
            <Trans id="ui2.admin.members.none">No users found.</Trans>
          </li>
        )}
      </ul>

      {totalPages > 1 && (
        <nav className="u2-row u2-members__pages" aria-label={i18n._({ id: "ui2.admin.members.pages", message: "Pages" })}>
          <Button small disabled={page <= 1} onClick={() => reload(query, level, page - 1)}>
            <Trans id="ui2.admin.members.prev">Previous</Trans>
          </Button>
          <span className="u2-muted u2-mono">
            {page} / {totalPages}
          </span>
          <Button small disabled={page >= totalPages} onClick={() => reload(query, level, page + 1)}>
            <Trans id="ui2.admin.members.next">Next</Trans>
          </Button>
        </nav>
      )}

      <ul className="u2-muted u2-members__legend">
        <li>
          <Trans id="ui2.admin.members.legendadmin">
            <strong>Administrators</strong> have full access to edit and manage content, permissions and all site settings.
          </Trans>
        </li>
        <li>
          <Trans id="ui2.admin.members.legendcollab">
            <strong>Collaborators</strong> can edit and manage content, but not permissions and settings.
          </Trans>
        </li>
        <li>
          <Trans id="ui2.admin.members.legendtrusted">
            <strong>Trusted members</strong> won&apos;t need to have their content moderated if moderation is enabled.
          </Trans>
        </li>
        <li>
          <Trans id="ui2.admin.members.legendblocked">
            <strong>Blocked</strong> users are unable to sign into this site.
          </Trans>
        </li>
      </ul>
    </AdminLayout>
  )
}

export default ManageMembersPage
