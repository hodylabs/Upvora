import "../../components/account/account.css"
import "./oauthecho.css"
import React, { useEffect } from "react"
import { Trans } from "@lingui/react/macro"
import { navigator } from "@fider/services"

// The admin's OAuth provider test page (Admin, Authentication, Test): the raw profile the
// provider sent and how Upvora reads it. Same checks as classic's OAuthEcho.page.

interface OAuthEchoPageProps {
  err: string | undefined
  body: string
  profile: {
    id: string
    name: string
    email: string
    roles: string[]
  }
  configuredRolesPath: string
  configuredAllowedRoles: string
}

type Level = "ok" | "warn" | "error"

export const roleCheckPasses = (allowedRoles: string, roles: string[] | undefined): boolean => {
  const allowed = allowedRoles
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r !== "")
  return allowed.length === 0 || (roles || []).some((r) => allowed.includes(r.trim()))
}

const Mark = ({ level }: { level: Level }) => (
  <span className={`u2-echo__mark u2-echo__mark--${level}`} aria-hidden="true">
    {level === "ok" ? "✓" : level === "warn" ? "!" : "✗"}
  </span>
)

const Row = (props: { level: Level; label: React.ReactNode; value: React.ReactNode; note?: React.ReactNode }) => (
  <li className="u2-echo__row">
    <Mark level={props.level} />
    <div>
      <div>
        <strong>{props.label}</strong> <span className="u2-mono">{props.value}</span>
      </div>
      {props.note && <div className="u2-muted">{props.note}</div>}
    </div>
  </li>
)

const OAuthEchoPage = (props: OAuthEchoPageProps) => {
  useEffect(() => {
    navigator.replaceState("/")
  }, [])

  if (props.err) {
    return (
      <section className="u2-panel u2-section u2-page">
        <h1 className="u2-section__title">
          <Trans id="ui2.oauthecho.error">Error</Trans>
        </h1>
        <pre className="u2-echo__pre">{props.err}</pre>
      </section>
    )
  }

  const p = props.profile
  const idOk = !!p && p.id !== ""
  const nameOk = !!p && p.name !== "Anonymous"
  const emailOk = !!p && p.email !== ""
  const hasRoles = !!p && !!p.roles && p.roles.length > 0
  const roleCheckConfigured = !!(props.configuredRolesPath && props.configuredAllowedRoles)
  const passes = !roleCheckConfigured || !p || roleCheckPasses(props.configuredAllowedRoles, p.roles)

  let body = props.body
  try {
    body = JSON.stringify(JSON.parse(props.body), null, "  ")
  } catch {
    // not JSON: show it as sent
  }

  return (
    <div className="u2-page">
      <section className="u2-panel u2-section">
        <h1 className="u2-section__title">
          <Trans id="ui2.oauthecho.raw">Raw body</Trans>
        </h1>
        <pre className="u2-echo__pre">{body}</pre>
      </section>
      <section className="u2-panel u2-section">
        <h2 className="u2-section__title">
          <Trans id="ui2.oauthecho.parsed">Parsed profile</Trans>
        </h2>
        <ul className="u2-echo">
          <Row
            level={idOk ? "ok" : "error"}
            label={<Trans id="ui2.oauthecho.id">ID:</Trans>}
            value={p?.id}
            note={!idOk && <Trans id="ui2.oauthecho.id.note">ID is required. If not found, users will see an error during sign in process.</Trans>}
          />
          <Row
            level={nameOk ? "ok" : "warn"}
            label={<Trans id="ui2.oauthecho.name">Name:</Trans>}
            value={p?.name}
            note={
              !nameOk && (
                <Trans id="ui2.oauthecho.name.note">
                  Name is required, if not found we&apos;ll use <strong>Anonymous</strong> as the name of every new user.
                </Trans>
              )
            }
          />
          <Row
            level={emailOk ? "ok" : "warn"}
            label={<Trans id="ui2.oauthecho.email">Email:</Trans>}
            value={p?.email}
            note={
              !emailOk && (
                <Trans id="ui2.oauthecho.email.note">
                  Email is not required, but highly recommended. If invalid or not found, new users won&apos;t receive notifications.
                </Trans>
              )
            }
          />
          <Row
            level={hasRoles ? "ok" : "warn"}
            label={<Trans id="ui2.oauthecho.roles">Roles:</Trans>}
            value={hasRoles ? p.roles.join(", ") : "(none)"}
            note={
              <Trans id="ui2.oauthecho.roles.note">
                Roles are optional and used for role-based access control when <strong>Allowed Roles</strong> is configured on this provider.
              </Trans>
            }
          />
          {roleCheckConfigured && (
            <Row
              level={passes ? "ok" : "error"}
              label={<Trans id="ui2.oauthecho.rolecheck">Role check:</Trans>}
              value={
                passes ? (
                  <span className="u2-echo__pass">
                    <Trans id="ui2.oauthecho.pass">Pass</Trans>
                  </span>
                ) : (
                  <span className="u2-danger">
                    <Trans id="ui2.oauthecho.fail">Fail: this user would be redirected to /access-denied</Trans>
                  </span>
                )
              }
              note={
                <Trans id="ui2.oauthecho.configured">
                  Configured roles path: <strong>{props.configuredRolesPath}</strong> · Allowed roles: <strong>{props.configuredAllowedRoles}</strong>
                </Trans>
              }
            />
          )}
        </ul>
      </section>
    </div>
  )
}

export default OAuthEchoPage
