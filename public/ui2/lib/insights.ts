import { http } from "@fider/services"

// Board insights and the Vora briefing come from two read endpoints (/_api/ui2/...).
// Both are optional: any failure (404, 500, network) returns null and the board
// hides the features that need them.

export type RowNote = { kind: "similar"; count: number } | { kind: "duplicate"; of: number } | { kind: "needs_details" }

export interface BoardInsights {
  momentum?: { [number: string]: number }
  moved?: { [number: string]: { from: string; to: string } }
  notes?: { [number: string]: RowNote[] }
  // Optional: a few voters per idea for the staff avatar stack, if the server sends them.
  voters?: { [number: string]: Voter[] }
}

export interface Voter {
  name: string
  avatarURL: string
}

export interface Briefing {
  since: string
  firstVisit: boolean
  newIdeas: number
  statusMoves: number
  votedMoved: number
  duplicates: number
}

const quietGet = async <T>(url: string): Promise<T | null> => {
  try {
    const res = await http.get<T>(url)
    return res.ok && res.data ? res.data : null
  } catch {
    return null
  }
}

export const MAX_INSIGHT_NUMBERS = 50

export const fetchInsights = (numbers: number[]): Promise<BoardInsights | null> => {
  const list = numbers.slice(0, MAX_INSIGHT_NUMBERS)
  if (list.length === 0) return Promise.resolve(null)
  return quietGet<BoardInsights>(`/_api/ui2/board-insights?numbers=${list.join(",")}`)
}

export const fetchBriefing = (): Promise<Briefing | null> => quietGet<Briefing>("/_api/ui2/briefing")

// What a row shows, in order: the "moved since you voted" chip, then Vora's notes.
// Action notes (merge, ask for details) are staff only; others see informational chips.
export type RowChip =
  | { kind: "moved"; from: string; to: string }
  | { kind: "similar"; count: number }
  | { kind: "duplicate"; of: number; action: boolean }
  | { kind: "needs_details"; action: true }

export const rowChips = (insights: BoardInsights | null | undefined, num: number, isStaff: boolean): RowChip[] => {
  if (!insights) return []
  const key = String(num)
  const chips: RowChip[] = []
  const moved = insights.moved?.[key]
  if (moved && moved.from && moved.to && moved.from !== moved.to) {
    chips.push({ kind: "moved", from: moved.from, to: moved.to })
  }
  for (const note of insights.notes?.[key] || []) {
    if (note.kind === "similar" && note.count > 0) {
      chips.push({ kind: "similar", count: note.count })
    } else if (note.kind === "duplicate" && note.of > 0 && note.of !== num) {
      if (isStaff) chips.push({ kind: "duplicate", of: note.of, action: true })
    } else if (note.kind === "needs_details" && isStaff) {
      chips.push({ kind: "needs_details", action: true })
    }
  }
  return chips
}

// "This week": votes in the last 7 days, null when unknown (the cell stays empty).
export const momentum = (insights: BoardInsights | null | undefined, num: number): number | null => {
  // The server leaves out posts with no recent votes, so a loaded map means 0 ("quiet").
  if (!insights?.momentum) return null
  const n = insights.momentum[String(num)]
  return typeof n === "number" ? n : 0
}

export const duplicateOf = (insights: BoardInsights | null | undefined, num: number): number | undefined => {
  const dup = (insights?.notes?.[String(num)] || []).find((n) => n.kind === "duplicate") as { of: number } | undefined
  return dup?.of
}
