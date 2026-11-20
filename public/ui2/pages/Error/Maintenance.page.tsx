import React from "react"
import { Trans } from "@lingui/react/macro"
import { ErrorLayout } from "./ErrorLayout"

interface MaintenanceProps {
  message: string
  until?: string
}

const Maintenance = (props: MaintenanceProps) => (
  <ErrorLayout showHomeLink={false} title={<Trans id="ui2.maintenance.title">Under maintenance</Trans>}>
    <p>{props.message}</p>
    {props.until ? (
      <p>
        <Trans id="ui2.maintenance.until">
          We&apos;ll be back at <strong>{props.until}</strong>.
        </Trans>
      </p>
    ) : (
      <p>
        <Trans id="ui2.maintenance.soon">We&apos;ll be back soon.</Trans>
      </p>
    )}
  </ErrorLayout>
)

export default Maintenance
