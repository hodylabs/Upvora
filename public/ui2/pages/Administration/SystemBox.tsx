import React, { useEffect, useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions } from "@fider/services"
import { SystemStatus } from "@fider/services/actions/system"
import { useFider } from "@fider/hooks"
import { Button } from "../../components/form"

// Classic's System box, in the new look: installed version, latest GitHub release
// (the server caches the check for a day), check for updates, and, when the updater
// sidecar is configured, "Update now" with a two-click confirm. While updating it
// polls the status every 3 s and reloads once the version changes or the update is
// done. Shown to administrators on every settings page, as classic does.

const POLL_MS = 3000

export const SystemBox = () => {
  const fider = useFider()
  const [status, setStatus] = useState<SystemStatus | undefined>()
  const [checking, setChecking] = useState(false)
  const [armed, setArmed] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState(false)
  const pollRef = useRef(0)

  const fetchStatus = async (force = false) => {
    const result = await actions.getSystemStatus(force)
    if (result.ok) setStatus(result.data)
    return result
  }

  useEffect(() => {
    fetchStatus()
    return () => window.clearInterval(pollRef.current)
  }, [])

  const checkNow = async () => {
    setChecking(true)
    await fetchStatus(true)
    setChecking(false)
  }

  const startUpdate = async () => {
    if (!armed) {
      setArmed(true)
      return
    }
    setArmed(false)
    const result = await actions.triggerSystemUpdate()
    if (!result.ok) {
      setUpdateError(true)
      return
    }
    setUpdating(true)
    pollRef.current = window.setInterval(async () => {
      try {
        const polled = await actions.getSystemStatus()
        if (!polled.ok) return // the app is restarting: keep polling
        setStatus(polled.data)
        if (polled.data.currentVersion !== fider.settings.version || polled.data.updateStatus === "done") {
          window.clearInterval(pollRef.current)
          window.location.reload()
        } else if (polled.data.updateStatus === "error") {
          window.clearInterval(pollRef.current)
          setUpdating(false)
          setUpdateError(true)
        }
      } catch {
        // a network hiccup while the container restarts: keep polling
      }
    }, POLL_MS)
  }

  const state = status?.state
  const stateLabel =
    state === "up-to-date"
      ? i18n._({ id: "ui2.admin.system.uptodate", message: "Up to date" })
      : state === "update-available"
        ? i18n._({ id: "ui2.admin.system.available", message: "Update available" })
        : state === "ahead"
          ? i18n._({ id: "ui2.admin.system.ahead", message: "Ahead of latest release" })
          : "-"

  return (
    <section className="u2-sys" aria-labelledby="u2-sys-h">
      <h2 id="u2-sys-h" className="u2-admin__eyebrow">
        <Trans id="ui2.admin.system.title">System</Trans>
      </h2>
      <dl className="u2-sys__rows">
        <div>
          <dt>
            <Trans id="ui2.admin.system.installed">Installed</Trans>
          </dt>
          <dd>
            <code>{fider.settings.version}</code>
          </dd>
        </div>
        <div>
          <dt>
            <Trans id="ui2.admin.system.latest">Latest release</Trans>
          </dt>
          <dd>
            {status?.latest ? (
              <a href={status.latest.url} target="_blank" rel="noopener noreferrer">
                <code>{status.latest.tag}</code>
              </a>
            ) : (
              <code>-</code>
            )}
          </dd>
        </div>
      </dl>
      <p className={`u2-sys__state u2-sys__state--${state ?? "unknown"}`} role="status">
        {stateLabel}
      </p>

      {updating ? (
        <div className="u2-sys__updating" role="status">
          <Trans id="ui2.admin.system.updating">Updating. The site will restart and this page will reload itself.</Trans>
          {status?.updateLog && <pre>{status.updateLog.split("\n").slice(-1)[0]}</pre>}
        </div>
      ) : (
        <div className="u2-sys__acts">
          <Button small variant="ghost" onClick={checkNow} loading={checking}>
            {checking ? <Trans id="ui2.admin.system.checking">Checking</Trans> : <Trans id="ui2.admin.system.check">Check for updates</Trans>}
          </Button>
          {status?.updaterConfigured && (
            <Button small variant={armed ? "danger-solid" : "primary"} onClick={startUpdate} data-armed={armed || undefined}>
              {armed ? <Trans id="ui2.admin.system.confirm">Click again to confirm</Trans> : <Trans id="ui2.admin.system.update">Update now</Trans>}
            </Button>
          )}
          <p className="u2-muted">
            <Trans id="ui2.admin.system.moved">
              Upvora has moved to{" "}
              <a href="https://github.com/HodyLabs/Upvora" target="_blank" rel="noopener noreferrer">
                github.com/HodyLabs/Upvora
              </a>
              . Images are published at <code>ghcr.io/hodylabs/upvora</code>; the old <code>ghcr.io/hodyhq/upvora</code> keeps receiving every release, so
              nothing breaks. The latest updater sidecar switches your compose file to the new address on its own.
            </Trans>
          </p>
          {status && !status.updaterConfigured && (
            <details className="u2-sys__more">
              <summary>
                <Trans id="ui2.admin.system.enable">Enable one-click updates</Trans>
              </summary>
              <p>
                <Trans id="ui2.admin.system.enablehelp">
                  Add the <code>updater</code> sidecar from the repo&apos;s{" "}
                  <a href="https://github.com/HodyLabs/Upvora/blob/main/docker-compose.example.yml" target="_blank" rel="noopener noreferrer">
                    docker-compose.example.yml
                  </a>{" "}
                  to your compose file: copy the <code>updater</code> service, the <code>updater-shared</code> volume, and the two <code>updater</code> lines on
                  the <code>app</code> service, then run <code>docker compose up -d</code>. An <b>Update now</b> button appears here. The web app never gets the
                  Docker socket; only the sidecar does.
                </Trans>
              </p>
            </details>
          )}
        </div>
      )}

      {updateError && (
        <p className="u2-sys__error" role="alert">
          <Trans id="ui2.admin.system.failed">The update failed to start or errored. See the recovery steps below.</Trans>
        </p>
      )}

      <details className="u2-sys__more" open={updateError}>
        <summary>
          <Trans id="ui2.admin.system.recovery">If the site doesn&apos;t come back</Trans>
        </summary>
        <p>
          <Trans id="ui2.admin.system.recoveryssh">SSH into the host, go to the compose directory and check the logs:</Trans>
        </p>
        <pre>
          docker compose logs app --tail 100{"\n"}
          docker compose logs updater --tail 50
        </pre>
        <p>
          <Trans id="ui2.admin.system.recoveryup">
            <code>docker compose up -d</code> brings everything back with the images already on disk.
          </Trans>
        </p>
      </details>
    </section>
  )
}
