import "../../components/form/form.css"
import "./scorecard.css"

import React, { useMemo, useState } from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { actions, navigator, notify } from "@fider/services"
import { useFider } from "@fider/hooks"
import { ProductChip } from "../../components/ProductChip"
import { StatusPill } from "../../components/StatusPill"
import { statusInfo } from "../../lib/status"
import { ProductFilter } from "../../components/ProductFilter"
import { productIdsFromURL, toggleId, writeProductIds } from "../../lib/products"
import { Button } from "../../components/form"
import { BandKey, Bucket, bandForScore, bands, computeWeightedScore, isScored, parseChoices, statusFieldOf } from "./score"

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
// The band filter's keys: the five bands plus cards nobody has scored yet.
type BandFilter = BandKey | "none"

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
  const [bandKeys, setBandKeys] = useState<BandFilter[]>([])
  const [creating, setCreating] = useState(false)
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

  const bandKeyOf = (c: ScorecardRecord): BandFilter => (isScored(c.values, fields) ? bandForScore(computeWeightedScore(c.values, fields), tenant).key : "none")

  const visible = cards.filter((c) => {
    if (productIds.length > 0 && !productIds.includes(c.productId ?? -1)) return false
    if (bandKeys.length > 0 && !bandKeys.includes(bandKeyOf(c))) return false
    if (tab !== "all" && bucketOf(c) !== tab) return false
    const q = query.toLowerCase()
    return !q || `${c.title} ${statusOf(c)} ${c.submittedBy ?? ""}`.toLowerCase().includes(q)
  })

  const clearFilters = () => {
    setTab("all")
    setQuery("")
    setBandKeys([])
    setProductIds([])
    writeProductIds(products, [])
  }

  const toggleProduct = (id: number) => {
    const next = toggleId(productIds, id)
    setProductIds(next)
    writeProductIds(products, next)
  }

  const toggleBand = (k: BandFilter) => setBandKeys((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]))
  const bandChips: { key: BandFilter; label: string }[] = [
    ...bands(tenant).map((b) => ({ key: b.key as BandFilter, label: b.label })),
    { key: "none", label: i18n._({ id: "ui2.scorecard.notscored", message: "Not scored" }) },
  ]

  const create = async () => {
    setCreating(true)
    const r = await actions.createScorecard({}).catch(() => ({ ok: false as const, data: undefined }))
    if (r.ok && r.data) {
      navigator.goTo(cardHref(r.data.id))
    } else {
      setCreating(false)
      notify.error(i18n._({ id: "ui2.scorecard.create.failed", message: "Could not create scorecard." }))
    }
  }

  return (
    <div className="u2-sc">
      <header className="u2-sc__head">
        <h1>
          <Trans id="header.nav.scorecard">Scorecard</Trans>
        </h1>
        <Button variant="primary" onClick={create} loading={creating}>
          <Trans id="ui2.scorecard.new">New scorecard</Trans>
        </Button>
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
            <button
              key={t.key}
              type="button"
              className={`u2-fchip u2-sc__tab${tab === t.key ? " is-on" : ""}`}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label()} <span className="u2-fchip__n u2-mono">{counts[t.key]}</span>
            </button>
          ))}
        </div>
        <label className="u2-sc__search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            className="u2-sc__input"
            placeholder={i18n._({ id: "ui2.scorecard.filter", message: "Filter cards" })}
            aria-label={i18n._({ id: "ui2.scorecard.filter", message: "Filter cards" })}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="u2-sc__bands" role="group" aria-label={i18n._({ id: "ui2.scorecard.bandfilter", message: "Filter by band" })}>
          {bandChips.map((b) => (
            <button
              key={b.key}
              type="button"
              className={`u2-fchip u2-sc__bandchip u2-band--${b.key}${bandKeys.includes(b.key) ? " is-on" : ""}`}
              aria-pressed={bandKeys.includes(b.key)}
              onClick={() => toggleBand(b.key)}
            >
              {b.label}
            </button>
          ))}
          {products.length > 0 && <span className="u2-sc__sep" aria-hidden="true" />}
          <ProductFilter products={products} selected={productIds} onToggle={toggleProduct} />
        </div>
      </div>

      <div className="u2-panel u2-sc__list" role="list" aria-label={i18n._({ id: "header.nav.scorecard", message: "Scorecard" })}>
        {visible.map((c) => {
          const score = computeWeightedScore(c.values, fields)
          const band = bandForScore(score, tenant)
          const scored = isScored(c.values, fields)
          const status = statusOf(c)
          const product = products.find((p) => p.id === c.productId)
          const number = c.postNumber
          const votes = c.postVotes ?? 0
          return (
            <div key={c.id} role="listitem" className="u2-sc__row" data-card={c.id} onClick={() => navigator.goTo(cardHref(c.id))}>
              <span
                className={`u2-sc__mini u2-band--${scored ? band.key : "none"}`}
                style={{ "--p": scored ? Math.min(100, score) : 0 } as React.CSSProperties}
                aria-hidden="true"
              >
                <span className="u2-mono">{scored ? score : "–"}</span>
              </span>
              <div className="u2-sc__main">
                <div className="u2-sc__title">
                  <a href={cardHref(c.id)} onClick={(e) => e.stopPropagation()}>
                    {c.title || i18n._({ id: "ui2.scorecard.untitled", message: "Scorecard #{id}", values: { id: c.id } })}
                  </a>
                  {product && <ProductChip product={product} />}
                </div>
                <div className="u2-sc__meta">
                  {number != null && (
                    <span className="u2-mono">
                      <Trans id="ui2.scorecard.ideanumber">Idea #{number}</Trans>
                    </span>
                  )}
                  {status && <span className="u2-sc__status-t">{status}</span>}
                  {c.submittedBy && <span>{c.submittedBy}</span>}
                  {number != null && (
                    <span>
                      <Plural id="ui2.scorecard.votes" value={votes} one="# vote" other="# votes" />
                    </span>
                  )}
                </div>
              </div>
              <div className="u2-sc__end">
                {scored ? (
                  <>
                    <span className={`u2-band u2-band--${band.key}`} data-band={band.key}>
                      {band.label}
                    </span>
                    <span className="u2-sr" data-score={score}>
                      {score}/100
                    </span>
                  </>
                ) : (
                  <span className="u2-band u2-band--none">
                    <Trans id="ui2.scorecard.notscored">Not scored</Trans>
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {visible.length === 0 && (
          <div className="u2-sc__empty">
            {cards.length === 0 ? (
              <Trans id="ui2.scorecard.empty">
                No scorecards yet. Cards get created automatically when an idea&apos;s status changes to your configured trigger, or manually with the button
                above.
              </Trans>
            ) : (
              <>
                <Trans id="ui2.scorecard.nomatch">No cards match this view.</Trans>{" "}
                <button type="button" className="u2-btn" onClick={clearFilters}>
                  <Trans id="ui2.roadmap.clear">Clear filters</Trans>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ScorecardPage
