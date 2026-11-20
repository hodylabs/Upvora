import React from "react"
import { Trans } from "@lingui/react/macro"
import { Tenant } from "@fider/models"
import { Band, bands, ringPoint, thresholdDots } from "./score"

const R = 64
const C = 80
const CIRC = 2 * Math.PI * R

// The weighted score as an SVG progress ring (classic's meaning kept): the arc runs
// to the score out of 100 in the current band's color, dots on the track mark where
// each band starts, and the side lists every band with the current one highlighted.
export const ScoreRing = (props: { score: number; band: Band; tenant: Tenant }) => {
  const { score, band, tenant } = props
  const p = Math.min(100, Math.max(0, score))
  const unscored = score === 0
  const threshold = band.threshold
  const low = tenant.scorecardBandLow
  return (
    <div className="u2-ring">
      <div className={`u2-ring__dial u2-band--${unscored ? "none" : band.key}`}>
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle className="u2-ring__track" cx={C} cy={C} r={R} />
          {thresholdDots(tenant).map((d) => {
            const pt = ringPoint(d.threshold, R, C)
            return <circle key={d.key} className={`u2-ring__dot u2-band--${d.key}`} cx={pt.x} cy={pt.y} r="3.5" data-threshold={d.threshold} />
          })}
          {p > 0 && <circle className="u2-ring__arc" cx={C} cy={C} r={R} strokeDasharray={`${(CIRC * p) / 100} ${CIRC}`} transform={`rotate(-90 ${C} ${C})`} />}
        </svg>
        <div className="u2-ring__center">
          <span className="u2-ring__num u2-mono" data-score={score}>
            {score}
          </span>
          {unscored && (
            <span className="u2-ring__none">
              <Trans id="ui2.scorecard.notscored">Not scored</Trans>
            </span>
          )}
        </div>
      </div>
      <div className="u2-ring__side">
        <span className="u2-ring__lbl">
          <Trans id="ui2.scorecard.weighted">Weighted score</Trans>
        </span>
        <ul className="u2-ring__bands">
          {bands(tenant).map((b) => {
            const points = b.key === "reject" ? 1 : b.threshold
            return (
              <li
                key={b.key}
                className={`u2-band--${b.key}${!unscored && band.key === b.key ? " is-current" : ""}`}
                aria-current={!unscored && band.key === b.key ? "true" : undefined}
              >
                <span className="u2-ring__bdot" aria-hidden="true" />
                <b>{b.label}</b>
                <span className="u2-mono u2-muted">
                  <Trans id="ui2.scorecard.pts">{points}+ pts</Trans>
                </span>
              </li>
            )
          })}
        </ul>
        <p className="u2-ring__hint u2-muted">
          {unscored ? (
            <Trans id="ui2.scorecard.hint.none">Score any dimension to place this card.</Trans>
          ) : band.threshold > 0 ? (
            <Trans id="ui2.scorecard.hint.band">Band threshold ≥ {threshold}</Trans>
          ) : (
            <Trans id="ui2.scorecard.hint.below">Below {low}</Trans>
          )}
        </p>
      </div>
    </div>
  )
}
