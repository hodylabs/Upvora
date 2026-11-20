import "../../components/form/form.css"
import "./scorecard.css"

import React, { useMemo, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { actions, navigator, notify } from "@fider/services"
import { useFider } from "@fider/hooks"
import { ProductChip } from "../../components/ProductChip"
import { StatusPill } from "../../components/StatusPill"
import { statusInfo } from "../../lib/status"
import { ProductFilter } from "../../components/ProductFilter"
import { productIdsFromURL, toggleId, writeProductIds } from "../../lib/products"
import { Bucket, bandForScore, computeWeightedScore, isScored, parseChoices, statusFieldOf } from "./score"

// Same props the server sends classic (app/handlers/scorecard.go, ListScorecardsForTenant).
export interface ScorecardRecord {
  id: number
  postId?: number
  title: string
  values: Record<string, unknown>
  createdAt: string
  updatedAt: string
  postNumber?: number
  postSlug?: string
  postVotes?: number
  submittedBy?: string
  productId?: number
}

export interface ScorecardPageProps {
  scorecards?: ScorecardRecord[]
}

type Tab = "all" | Bucket

const TABS: { key: Tab; label: () => string }[] = [
  { key: "all", label: () => i18n._({ id: "ui2.scorecard.tab.all", message: "All" }) },
  { key: "new", label: () => i18n._({ id: "ui2.scorecard.tab.new", message: "New" }) },
  { key: "review", label: () => i18n._({ id: "ui2.scorecard.tab.review", message: "In review" }) },
  { key: "executive", label: () => i18n._({ id: "ui2.scorecard.tab.executive", message: "Executive" }) },
]

const cardHref = (id: number) => `/scorecard/${id}`

const ScorecardPage = (props: ScorecardPageProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const cards = props.scorecards ?? []
  const products = tenant.products ?? []
  const fields = tenant.scorecardFields ?? []
  const trigger = tenant.scorecardTriggerStatusSlug ? statusInfo(tenant, tenant.scorecardTriggerStatusSlug) : null
  const [tab, setTab] = useState<Tab>("all")
  const [query, setQuery] = useState("")
  const [productIds, setProductIds] = useState<number[]>(() => productIdsFromURL(products, location.search))

  // Tabs come from the header status field: each of its choices maps to a bucket.
  const statusField = statusFieldOf(fields)
  const bucketByStatus = useMemo(() => new Map(parseChoices(statusField?.choices).map((c) => [c.value, c.bucket])), [statusField])
  const statusOf = (c: ScorecardRecord): string => String(c.values?.[statusField?.key ?? "status"] ?? "")
  const bucketOf = (c: ScorecardRecord): Bucket | undefined => bucketByStatus.get(statusOf(c))

  const counts: Record<Tab, number> = { all: cards.length, new: 0, review: 0, executive: 0 }
  for (const c of cards) {
    const b = bucketOf(c)
    if (b) counts[b]++
  }

  const visible = cards.filter((c) => {
    if (productIds.length > 0 && !productIds.includes(c.productId ?? -1)) return false
    if (tab !== "all" && bucketOf(c) !== tab) return false
    const q = query.toLowerCase()
    return !q || `${c.title} ${statusOf(c)} ${c.submittedBy ?? ""}`.toLowerCase().includes(q)
  })

  const toggleProduct = (id: number) => {
    const next = toggleId(productIds, id)
    setProductIds(next)
    writeProductIds(products, next)
  }

  const create = async () => {
    const r = await actions.createScorecard({})
    if (r.ok && r.data) {
      navigator.goTo(cardHref(r.data.id))
    } else {
      notify.error(i18n._({ id: "ui2.scorecard.create.failed", message: "Could not create scorecard." }))
    }
  }

  return (
    <div className="u2-sc">
      <header className="u2-sc__head">
        <h1>
          <Trans id="header.nav.scorecard">Scorecard</Trans>
        </h1>
        <button type="button" className="u2-btn u2-btn--primary" onClick={create}>
          <Trans id="ui2.scorecard.new">New scorecard</Trans>
        </button>
      </header>

      {trigger && (
        <p className="u2-sc__trigger u2-muted">
          <Trans id="ui2.scorecard.trigger">New cards are created when an idea moves to</Trans> <StatusPill status={trigger} />
        </p>
      )}

      {!tenant.isScorecardEnabled && (
        <p className="u2-sc__off" role="status">
          <Trans id="ui2.scorecard.off">
            The scorecard is turned off for this site. An administrator can turn it on in <a href="/admin/scorecard-settings">Site settings, Scorecard</a>.
          </Trans>
        </p>
      )}

      <div className="u2-sc__tools">
        <div className="u2-sc__tabs" role="group" aria-label={i18n._({ id: "ui2.scorecard.views", message: "Scorecard views" })}>
          {TABS.map((t) => (
            <button key={t.key} type="button" className="u2-sc__tab" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label()} <span className="u2-mono u2-muted">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <div className="u2-sc__tools-end">
          <ProductFilter products={products} selected={productIds} onToggle={toggleProduct} />
          <input
            type="search"
            className="u2-ctl u2-sc__input"
            placeholder={i18n._({ id: "ui2.scorecard.filter", message: "Filter cards" })}
            aria-label={i18n._({ id: "ui2.scorecard.filter", message: "Filter cards" })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="u2-panel u2-sc__wrap">
        <table className="u2-sc__table">
          <thead>
            <tr>
              <th scope="col">
                <Trans id="ui2.table.idea">Idea</Trans>
              </th>
              <th scope="col">
                <Trans id="ui2.table.status">Status</Trans>
              </th>
              <th scope="col">
                <Trans id="ui2.scorecard.band">Band</Trans>
              </th>
              <th scope="col" className="is-end">
                <Trans id="ui2.scorecard.score">Score</Trans>
              </th>
              <th scope="col">
                <Trans id="ui2.scorecard.submittedby">Submitted by</Trans>
              </th>
              <th scope="col" className="is-end">
                <Trans id="ui2.table.votes">Votes</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => {
              const score = computeWeightedScore(c.values, fields)
              const band = bandForScore(score, tenant)
              const scored = isScored(c.values, fields)
              const status = statusOf(c)
              const product = products.find((p) => p.id === c.productId)
              const number = c.postNumber
              return (
                <tr key={c.id} data-card={c.id} onClick={() => navigator.goTo(cardHref(c.id))}>
                  <td>
                    <div className="u2-sc__title">
                      <a href={cardHref(c.id)} onClick={(e) => e.stopPropagation()}>
                        {c.title || i18n._({ id: "ui2.scorecard.untitled", message: "Scorecard #{id}", values: { id: c.id } })}
                      </a>
                      {product && <ProductChip product={product} />}
                    </div>
                    {c.postNumber != null && (
                      <div className="u2-sc__sub u2-mono">
                        <Trans id="ui2.scorecard.ideanumber">Idea #{number}</Trans>
                      </div>
                    )}
                  </td>
                  <td>{status ? <span className="u2-chip">{status}</span> : <span className="u2-muted">–</span>}</td>
                  <td>
                    {scored ? (
                      <span className={`u2-band u2-band--${band.key}`} data-band={band.key}>
                        {band.label}
                      </span>
                    ) : (
                      <span className="u2-chip u2-muted">
                        <Trans id="ui2.scorecard.notscored">Not scored</Trans>
                      </span>
                    )}
                  </td>
                  <td className="is-end">
                    {scored ? (
                      <span className="u2-sc__score">
                        <span className="u2-mono" data-score={score}>
                          <b>{score}</b>
                          <span className="u2-muted">/100</span>
                        </span>
                        <span className={`u2-sc__strip u2-band--${band.key}`} aria-hidden="true">
                          <i style={{ width: `${Math.min(100, score)}%` }} />
                        </span>
                      </span>
                    ) : (
                      <span className="u2-muted">–</span>
                    )}
                  </td>
                  <td>{c.submittedBy || <span className="u2-muted">–</span>}</td>
                  <td className="is-end u2-mono">{c.postNumber != null ? (c.postVotes ?? 0) : <span className="u2-muted">–</span>}</td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr className="u2-sc__empty">
                <td colSpan={6}>
                  {cards.length === 0 ? (
                    <Trans id="ui2.scorecard.empty">
                      No scorecards yet. Cards get created automatically when an idea&apos;s status changes to your configured trigger, or manually with the
                      button above.
                    </Trans>
                  ) : (
                    <Trans id="ui2.scorecard.nomatch">No cards match this view.</Trans>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default ScorecardPage
