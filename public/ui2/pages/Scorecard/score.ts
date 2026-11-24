import { ScorecardField, ScorecardFieldChoice, Tenant } from "@fider/models"

// Ported as is from classic (public/pages/Scorecard/ScoreBand.tsx) so both UIs score a
// card the same. Mirrors the Go side too: round(sum(value * weight) / 5) over active
// score fields; values may be numbers or numeric strings.
export const computeWeightedScore = (values: Record<string, unknown> | undefined, fields: ScorecardField[] | undefined): number => {
  if (!fields) return 0
  const v = values ?? {}
  let total = 0
  for (const f of fields) {
    if (f.type !== "score" || !f.isActive) continue
    const w = f.weight ?? 0
    const raw = v[f.key]
    const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "0"), 10) || 0
    total += n * w
  }
  return Math.round(total / 5)
}

export type BandKey = "strong" | "good" | "refine" | "low" | "reject"

export interface Band {
  key: BandKey
  label: string
  // the score that puts a card in this band (0 for the bottom band)
  threshold: number
}

type BandTenant = Pick<
  Tenant,
  | "scorecardBandStrong"
  | "scorecardBandGood"
  | "scorecardBandRefine"
  | "scorecardBandLow"
  | "scorecardBandStrongLabel"
  | "scorecardBandGoodLabel"
  | "scorecardBandRefineLabel"
  | "scorecardBandLowLabel"
  | "scorecardBandNoneLabel"
>

// The five bands best to worst, with the site's labels (classic's defaults otherwise).
export const bands = (t: BandTenant): Band[] => [
  { key: "strong", label: t.scorecardBandStrongLabel || "Strong Candidate", threshold: t.scorecardBandStrong },
  { key: "good", label: t.scorecardBandGoodLabel || "Good Candidate", threshold: t.scorecardBandGood },
  { key: "refine", label: t.scorecardBandRefineLabel || "Needs Refinement", threshold: t.scorecardBandRefine },
  { key: "low", label: t.scorecardBandLowLabel || "Low Priority", threshold: t.scorecardBandLow },
  { key: "reject", label: t.scorecardBandNoneLabel || "Not Recommended", threshold: 0 },
]

// First band whose threshold the score reaches, checked best first (classic's order).
export const bandForScore = (score: number, t: BandTenant): Band => {
  const all = bands(t)
  return all.slice(0, 4).find((b) => score >= b.threshold) || all[4]
}

// A card counts as scored when any active score field has a non-zero value (classic's list rule).
export const isScored = (values: Record<string, unknown> | undefined, fields: ScorecardField[]): boolean =>
  fields.some((f) => f.type === "score" && f.isActive && String(values?.[f.key] ?? "0") !== "0")

// Answered = a value that isn't blank or a zero score. Retired fields with an answer on
// this card keep rendering (read only) so committee history stays visible.
export const isAnswered = (v: unknown): boolean => v != null && String(v) !== "" && String(v) !== "0"

// Choices may be stored as plain strings (older data) or objects.
export const parseChoices = (raw: unknown): ScorecardFieldChoice[] => {
  if (!raw || !Array.isArray(raw)) return []
  return raw
    .map((c: unknown): ScorecardFieldChoice => {
      if (typeof c === "string") return { value: c }
      const o = (c || {}) as { value?: unknown; color?: string; bucket?: ScorecardFieldChoice["bucket"] }
      return { value: String(o.value ?? ""), color: o.color, bucket: o.bucket }
    })
    .filter((c) => c.value !== "")
}

export type Bucket = "new" | "review" | "executive"

// The scorecard list's status field: the first active choice field in the header group.
export const statusFieldOf = (fields: ScorecardField[]): ScorecardField | undefined =>
  fields.find((f) => f.groupKey === "header" && f.type === "choice" && f.isActive)
