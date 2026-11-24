import React from "react"
import { Trans } from "@lingui/react/macro"
import { Tenant } from "@fider/models"
import { Band, bands } from "./score"

// The weighted score: the number and band, a track split into the five band zones
// (each as wide as its range) with a marker at the score, and the gap to the next band.
export const ScoreMeter = (props: { score: number; band: Band; tenant: Tenant }) => {
  const { score, band, tenant } = props
  const unscored = score === 0
  const p = Math.min(100, Math.max(0, score))
  // Zones worst to best, each as wide as its share of 0..100.
  const zones = bands(tenant)
    .slice()
    .reverse()
    .map((b, i, all) => ({ ...b, width: Math.max(0, (all[i + 1]?.threshold ?? 100) - b.threshold) }))
  const next = zones.find((z) => z.threshold > score && z.key !== "reject")
  const gap = next ? next.threshold - score : 0
  const nextLabel = next?.label

  return (
    <div className={`u2-meter u2-band--${unscored ? "none" : band.key}`}>
      <div className="u2-meter__head">
        <span className="u2-meter__num" data-score={score}>
          {unscored ? "–" : score}
          <small>/100</small>
        </span>
        <span className="u2-meter__band">{unscored ? <Trans id="ui2.scorecard.notscored">Not scored</Trans> : band.label}</span>
        <span className="u2-meter__next">
          {unscored ? (
            <Trans id="ui2.scorecard.hint.none">Score any dimension to place this card.</Trans>
          ) : next ? (
            <Trans id="ui2.scorecard.tonext">
              {gap} pts to {nextLabel}
            </Trans>
          ) : (
            <Trans id="ui2.scorecard.top">Top band</Trans>
          )}
        </span>
      </div>

      <div className="u2-meter__track" aria-hidden="true">
        {zones.map((z) => (
          <span
            key={z.key}
            className={`u2-meter__zone u2-band--${z.key}${!unscored && z.key === band.key ? " is-current" : ""}`}
            style={{ flexGrow: z.width }}
            data-threshold={z.threshold}
          />
        ))}
        {!unscored && <span className="u2-meter__mark" style={{ insetInlineStart: `${p}%` }} />}
      </div>
      {/* Names under the track, same widths, so the marker never covers them. */}
      <div className="u2-meter__labels" aria-hidden="true">
        {zones.map((z) => (
          <span
            key={z.key}
            className={`u2-meter__zlabel u2-band--${z.key}${!unscored && z.key === band.key ? " is-current" : ""}`}
            style={{ flexGrow: z.width }}
          >
            {z.label}
            <small className="u2-mono">{z.threshold}</small>
          </span>
        ))}
      </div>
    </div>
  )
}
