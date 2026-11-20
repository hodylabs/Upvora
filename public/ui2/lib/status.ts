import { i18n } from "@lingui/core"
import { Tenant, resolveStatus, statusLabel, PostStatus } from "@fider/models"

// The four status colors run in order: Under review gray, Planned cool blue,
// In progress orange, Shipped green (tokens --u-s-review/planned/progress/shipped).
export type StatusTone = "review" | "planned" | "progress" | "shipped"

// How a status maps to a tone, first match wins:
// 1. Known slugs: open/under-review/new/triage -> review; planned/next/later -> planned;
//    started/in-progress/building/beta -> progress; completed/shipped/done/released/live -> shipped.
// 2. Otherwise a slug with one of those as a whole word (e.g. "planned-q1", "shipped-v2").
// 3. Otherwise the status kind: closed-completed -> shipped; active -> progress;
//    open, closed-declined and duplicate -> review (gray: not moving forward).
const bySlug: [StatusTone, string[]][] = [
  ["shipped", ["completed", "shipped", "done", "released", "live"]],
  ["progress", ["started", "in-progress", "progress", "building", "beta", "doing"]],
  ["planned", ["planned", "next", "later", "scheduled", "roadmap"]],
  ["review", ["open", "under-review", "review", "new", "triage"]],
]

export const statusTone = (slug: string, kind?: string): StatusTone => {
  const s = (slug || "").toLowerCase().replace(/[\s_]+/g, "-")
  for (const [tone, slugs] of bySlug) {
    if (slugs.includes(s)) return tone
  }
  // Whole words only, so "renewal" is not "new" and "context" is not "next".
  const padded = `-${s}-`
  for (const [tone, slugs] of bySlug) {
    if (slugs.some((w) => padded.includes(`-${w}-`))) return tone
  }
  if (kind === "closed-completed") return "shipped"
  if (kind === "active") return "progress"
  return "review"
}

export interface StatusInfo {
  slug: string
  label: string
  tone: StatusTone
}

// statusInfo resolves the label (translated for built-in slugs) and tone for a slug.
export const statusInfo = (tenant: Tenant | undefined, slug: string, kind?: string): StatusInfo => {
  const row = resolveStatus(tenant, slug)
  const label = statusLabel({ value: slug, label: row?.label || PostStatus.Get(slug).title }, (id, fallback) => i18n._({ id, message: fallback }))
  return { slug, label, tone: statusTone(slug, row?.kind || kind) }
}
