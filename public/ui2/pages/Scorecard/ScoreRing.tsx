import React, { useId } from "react"
import { Trans } from "@lingui/react/macro"
import { Tenant } from "@fider/models"
import { Band, bands } from "./score"

const R = 70
const C = 84
const CIRC = 2 * Math.PI * R
// Gap between band arcs, in percent of the ring.
const GAP = 1.2

// Point on the ring `pct` percent clockwise from 12 o'clock.
const at = (pct: number) => {
  const a = ((pct * 3.6 - 90) * Math.PI) / 180
  return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) }
}

// An arc from `from` to `to` percent, drawn as a dashed circle rotated to its start.
const arc = (from: number, to: number) => ({
  strokeDasharray: `${(CIRC * Math.max(0, to - from)) / 100} ${CIRC}`,
  transform: `rotate(${from * 3.6 - 90} ${C} ${C})`,
})

// The weighted score as a ring split into the five band arcs (each as long as its
// range), a glowing arc up to the score with a knob at its end, the number and band in
// the middle; beside it the band list and the gap to the next band.
export const ScoreRing = (props: { score: number; band: Band; tenant: Tenant }) => {
  const { score, band, tenant } = props
  const unscored = score === 0
  const p = Math.min(100, Math.max(0, score))
  const gradId = `u2-ring-${useId().replace(/:/g, "")}`
  // Bands worst to best with their start and end on the ring.
  const zones = bands(tenant)
    .slice()
    .reverse()
    .map((b, i, all) => ({ ...b, end: all[i + 1]?.threshold ?? 100 }))
  const next = zones.find((z) => z.threshold > score && z.key !== "reject")
  const gap = next ? next.threshold - score : 0
  const nextLabel = next?.label
  const knob = at(p)

  return (
    <div className={`u2-ring u2-band--${unscored ? "none" : band.key}`}>
      <div className="u2-ring__dial">
        <svg viewBox={`0 0 ${C * 2} ${C * 2}`} aria-hidden="true">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className="u2-ring__stop-hi" />
              <stop offset="1" className="u2-ring__stop" />
            </linearGradient>
          </defs>
          {zones.map((z) => (
            <circle
              key={z.key}
              className={`u2-ring__seg u2-band--${z.key}`}
              cx={C}
              cy={C}
              r={R}
              data-threshold={z.threshold}
              {...arc(z.threshold + GAP / 2, z.end - GAP / 2)}
            />
          ))}
          {!unscored && (
            <>
              <circle className="u2-ring__arc" cx={C} cy={C} r={R} style={{ stroke: `url(#${gradId})` }} {...arc(0, p)} />
              <circle className="u2-ring__knob" cx={knob.x} cy={knob.y} r="7" />
            </>
          )}
        </svg>
        <div className="u2-ring__center">
          <span className="u2-ring__num" data-score={score}>
            {unscored ? "–" : score}
          </span>
          <span className="u2-ring__of u2-mono">/100</span>
        </div>
      </div>

      <div className="u2-ring__side">
        <span className="u2-ring__band">{unscored ? <Trans id="ui2.scorecard.notscored">Not scored</Trans> : band.label}</span>
        <span className="u2-ring__next">
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
        <ul className="u2-ring__legend">
          {zones
            .slice()
            .reverse()
            .map((z) => (
              <li key={z.key} className={`u2-band--${z.key}${!unscored && z.key === band.key ? " is-current" : ""}`}>
                <i aria-hidden="true" />
                {z.label}
                <span className="u2-mono">{z.threshold}+</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}
