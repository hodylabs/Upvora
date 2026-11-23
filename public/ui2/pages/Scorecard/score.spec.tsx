import React from "react"
import { render, fireEvent, act, screen } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import { ScorecardField, Tenant } from "@fider/models"
import { bandForScore, computeWeightedScore, isAnswered, isScored, parseChoices, thresholdDots } from "./score"
import ScorecardPage from "./Scorecard.page"
import ScorecardCardPage, { SAVE_DEBOUNCE_MS } from "./ScorecardCard.page"

const field = (key: string, extra: Partial<ScorecardField> = {}): ScorecardField =>
  ({
    id: key.length,
    key,
    label: key,
    groupKey: "scoring",
    type: "score",
    weight: 0,
    sortOrder: 0,
    isSystem: false,
    isActive: true,
    ...extra,
  }) as ScorecardField

// Weights sum to 100, as the admin page enforces: all fives score 100.
const scoring = [field("impact", { weight: 40 }), field("effort", { weight: 35 }), field("risk", { weight: 25 })]

const tenant = {
  scorecardBandStrong: 80,
  scorecardBandGood: 60,
  scorecardBandRefine: 40,
  scorecardBandLow: 20,
  scorecardBandStrongLabel: "",
  scorecardBandGoodLabel: "Go",
  scorecardBandRefineLabel: "",
  scorecardBandLowLabel: "",
  scorecardBandNoneLabel: "",
} as unknown as Tenant

describe("scorecard score and bands (classic's logic)", () => {
  test("weighted score = round(sum(value * weight) / 5) over active score fields", () => {
    expect(computeWeightedScore({ impact: 5, effort: 5, risk: 5 }, scoring)).toBe(100)
    expect(computeWeightedScore({ impact: 3, effort: 2, risk: 1 }, scoring)).toBe(Math.round((120 + 70 + 25) / 5))
    // numeric strings count; junk and missing count as zero
    expect(computeWeightedScore({ impact: "4", effort: "x" }, scoring)).toBe(32)
    expect(computeWeightedScore(undefined, scoring)).toBe(0)
    expect(computeWeightedScore({ impact: 5 }, undefined)).toBe(0)
    // rounding: 1 * 7 / 5 = 1.4 -> 1, 1 * 8 / 5 = 1.6 -> 2
    expect(computeWeightedScore({ a: 1 }, [field("a", { weight: 7 })])).toBe(1)
    expect(computeWeightedScore({ a: 1 }, [field("a", { weight: 8 })])).toBe(2)
  })

  test("retired and non-score fields never count", () => {
    const fields = [...scoring, field("old", { weight: 50, isActive: false }), field("note", { type: "text", weight: 50 })]
    expect(computeWeightedScore({ impact: 5, old: 5, note: 5 }, fields)).toBe(40)
  })

  test("bands are checked best first, at or above each threshold", () => {
    const at = (s: number) => bandForScore(s, tenant)
    expect(at(100).key).toBe("strong")
    expect(at(80).key).toBe("strong")
    expect(at(79).key).toBe("good")
    expect(at(60).key).toBe("good")
    expect(at(59).key).toBe("refine")
    expect(at(40).key).toBe("refine")
    expect(at(20).key).toBe("low")
    expect(at(19).key).toBe("reject")
    expect(at(0).key).toBe("reject")
    expect(at(19).threshold).toBe(0)
    expect(at(65).threshold).toBe(60)
  })

  test("band labels use the site's own, else classic's defaults", () => {
    expect(bandForScore(90, tenant).label).toBe("Strong Candidate")
    expect(bandForScore(70, tenant).label).toBe("Go")
    expect(bandForScore(50, tenant).label).toBe("Needs Refinement")
    expect(bandForScore(30, tenant).label).toBe("Low Priority")
    expect(bandForScore(0, tenant).label).toBe("Not Recommended")
  })

  test("threshold dots sit at each band start strictly inside 0..100", () => {
    expect(thresholdDots(tenant).map((d) => d.threshold)).toEqual([20, 40, 60, 80])
    expect(thresholdDots({ ...tenant, scorecardBandLow: 0, scorecardBandStrong: 100 } as Tenant).map((d) => d.key)).toEqual(["refine", "good"])
  })

  test("scored, answered and choices", () => {
    expect(isScored({ impact: 0 }, scoring)).toBe(false)
    expect(isScored({ impact: "0", effort: 2 }, scoring)).toBe(true)
    expect(isAnswered("")).toBe(false)
    expect(isAnswered(0)).toBe(false)
    expect(isAnswered("x")).toBe(true)
    expect(parseChoices(["New", { value: "Exec", bucket: "executive" }, { value: "" }, 3])).toEqual([
      { value: "New" },
      { value: "Exec", color: undefined, bucket: "executive" },
    ]) // as classic: blank values and bare non-strings are dropped
  })
})

const statusField = field("status", {
  groupKey: "header",
  type: "choice",
  choices: [
    { value: "Submitted", bucket: "new" },
    { value: "Committee", bucket: "executive" },
  ],
})

const fiderWith = (extra: Partial<Tenant> = {}) =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en" },
    tenant: { ...tenant, isScorecardEnabled: true, scorecardFields: [statusField, ...scoring], products: [], statuses: [], ...extra },
    user: { name: "Ada", isCollaborator: true, isAdministrator: false },
  })

describe("ui2 Scorecard list", () => {
  beforeEach(() => window.history.replaceState({}, "", "/scorecard"))

  const cards = [
    { id: 1, title: "Alpha", values: { status: "Submitted", impact: 5, effort: 5, risk: 5 }, createdAt: "", updatedAt: "", postNumber: 9, postVotes: 4 },
    { id: 2, title: "Beta", values: { status: "Committee" }, createdAt: "", updatedAt: "", submittedBy: "Grace" },
  ]

  test("rows show the score, band and score strip; tabs filter by the status field's buckets", () => {
    const { container } = render(
      <FiderContext.Provider value={fiderWith()}>
        <ScorecardPage scorecards={cards} />
      </FiderContext.Provider>
    )
    expect(container.querySelector('[data-card="1"] [data-score]')?.getAttribute("data-score")).toBe("100")
    expect(container.querySelector('[data-card="1"] [data-band]')?.getAttribute("data-band")).toBe("strong")
    expect(container.querySelector('[data-card="1"] .u2-sc__strip i')).toHaveStyle({ width: "100%" })
    expect(container.querySelector('[data-card="2"] [data-band]')).toBeNull()

    const tabs = container.querySelectorAll<HTMLButtonElement>(".u2-sc__tab")
    fireEvent.click(tabs[3]) // Executive
    expect(Array.from(container.querySelectorAll("[data-card]")).map((r) => r.getAttribute("data-card"))).toEqual(["2"])
    fireEvent.click(tabs[1]) // New
    expect(Array.from(container.querySelectorAll("[data-card]")).map((r) => r.getAttribute("data-card"))).toEqual(["1"])
  })

  test("the filter box matches title, status and submitter", () => {
    const { container } = render(
      <FiderContext.Provider value={fiderWith()}>
        <ScorecardPage scorecards={cards} />
      </FiderContext.Provider>
    )
    fireEvent.change(container.querySelector(".u2-sc__input") as HTMLInputElement, { target: { value: "grace" } })
    expect(Array.from(container.querySelectorAll("[data-card]")).map((r) => r.getAttribute("data-card"))).toEqual(["2"])
  })

  test("band chips filter the list, with Not scored for cards without a score", () => {
    const { container } = render(
      <FiderContext.Provider value={fiderWith()}>
        <ScorecardPage scorecards={cards} />
      </FiderContext.Provider>
    )
    const rows = () => Array.from(container.querySelectorAll("[data-card]")).map((r) => r.getAttribute("data-card"))
    const notScored = screen.getByRole("button", { name: "Not scored", pressed: false })
    fireEvent.click(notScored)
    expect(notScored).toHaveAttribute("aria-pressed", "true")
    expect(rows()).toEqual(["2"])
    fireEvent.click(container.querySelector(".u2-sc__bandchip.u2-band--strong") as HTMLElement)
    expect(rows()).toEqual(["1", "2"])
    fireEvent.click(notScored)
    expect(rows()).toEqual(["1"])
  })
})

describe("ui2 Scorecard card", () => {
  afterEach(() => jest.useRealTimers())

  test("moving a score slider updates the ring and autosaves after the pause", async () => {
    jest.useFakeTimers()
    const put = jest.fn(() => Promise.resolve({ ok: true, data: {} }))
    http.put = put as unknown as typeof http.put
    http.get = jest.fn(() => Promise.resolve({ ok: false, data: {} })) as unknown as typeof http.get
    const { container } = render(
      <FiderContext.Provider value={fiderWith()}>
        <ScorecardCardPage scorecard={{ id: 5, title: "Alpha", values: { impact: 5 }, createdAt: "2026-11-01T00:00:00Z", updatedAt: "" }} />
      </FiderContext.Provider>
    )
    const num = () => container.querySelector(".u2-ring__num")?.getAttribute("data-score")
    expect(num()).toBe("40")
    expect(container.querySelectorAll(".u2-ring__dot")).toHaveLength(4)
    expect(container.querySelector(".u2-ring__bands .is-current")?.className).toContain("u2-band--refine")

    fireEvent.change(container.querySelector("#sc-effort") as HTMLInputElement, { target: { value: "5" } })
    expect(num()).toBe("75")
    expect(container.querySelector(".u2-ring__bands .is-current")?.className).toContain("u2-band--good")
    expect(put).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    })
    expect(put).toHaveBeenCalledWith("/_api/scorecards/5", { title: "Alpha", values: { impact: 5, effort: 5 } })
  })

  test("an older save that finishes after a newer edit leaves the card unsaved until that edit saves", async () => {
    jest.useFakeTimers()
    let finish: (v: unknown) => void = () => undefined
    const put = jest
      .fn()
      .mockReturnValueOnce(new Promise((r) => (finish = r)))
      .mockReturnValue(Promise.resolve({ ok: true, data: {} }))
    http.put = put as unknown as typeof http.put
    http.get = jest.fn(() => Promise.resolve({ ok: false, data: {} })) as unknown as typeof http.get
    const { container } = render(
      <FiderContext.Provider value={fiderWith()}>
        <ScorecardCardPage scorecard={{ id: 5, title: "Alpha", values: {}, createdAt: "2026-11-01T00:00:00Z", updatedAt: "" }} />
      </FiderContext.Provider>
    )
    const state = () => container.querySelector(".u2-sc__save")?.getAttribute("data-state")
    fireEvent.change(container.querySelector("#sc-effort") as HTMLInputElement, { target: { value: "3" } })
    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    })
    expect(put).toHaveBeenCalledTimes(1)
    // A newer edit while the first save runs; its debounce has not fired yet.
    fireEvent.change(container.querySelector("#sc-effort") as HTMLInputElement, { target: { value: "4" } })
    await act(async () => finish({ ok: true, data: {} }))
    expect(state()).toBe("dirty")
    await act(async () => {
      jest.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    })
    expect(put).toHaveBeenLastCalledWith("/_api/scorecards/5", { title: "Alpha", values: { effort: 4 } })
    expect(state()).toBe("saved")
  })

  test("retired fields show only where this card answered them, read only; legacy choices stay selectable", () => {
    const fields = [
      statusField,
      field("gone", { groupKey: "context", type: "text", isActive: false }),
      field("kept", { groupKey: "context", type: "text", isActive: false }),
      field("kind", { groupKey: "classification", type: "choice", choices: [{ value: "A" }] }),
    ]
    const { container } = render(
      <FiderContext.Provider value={fiderWith({ scorecardFields: fields })}>
        <ScorecardCardPage scorecard={{ id: 5, title: "T", values: { kept: "yes", kind: "Old" }, createdAt: "", updatedAt: "" }} />
      </FiderContext.Provider>
    )
    expect(container.querySelector("#sc-gone")).toBeNull()
    expect(container.querySelector("#sc-kept")).toBeDisabled()
    const kind = container.querySelector("#sc-kind") as HTMLSelectElement
    expect(Array.from(kind.options).map((o) => o.value)).toEqual(["", "A", "Old"])
    expect(kind.value).toBe("Old")
  })
})
