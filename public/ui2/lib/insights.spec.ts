import { http } from "@fider/services"
import { httpMock } from "@fider/services/testing"
import { BoardInsights, fetchInsights, fetchBriefing, rowChips, momentum, duplicateOf } from "./insights"

const insights: BoardInsights = {
  momentum: { "412": 24, "366": 0 },
  moved: { "398": { from: "planned", to: "started" } },
  notes: {
    "412": [{ kind: "similar", count: 3 }],
    "433": [{ kind: "duplicate", of: 412 }],
    "421": [{ kind: "needs_details" }],
  },
}

describe("ui2 board insights mapping", () => {
  test("moved becomes a chip with both statuses", () => {
    expect(rowChips(insights, 398, false)).toEqual([{ kind: "moved", from: "planned", to: "started" }])
  })

  test("similar is an informational chip for everyone", () => {
    expect(rowChips(insights, 412, false)).toEqual([{ kind: "similar", count: 3 }])
    expect(rowChips(insights, 412, true)).toEqual([{ kind: "similar", count: 3 }])
  })

  test("duplicate and needs-details are staff actions only", () => {
    expect(rowChips(insights, 433, true)).toEqual([{ kind: "duplicate", of: 412, action: true }])
    expect(rowChips(insights, 421, true)).toEqual([{ kind: "needs_details", action: true }])
    expect(rowChips(insights, 433, false)).toEqual([])
    expect(rowChips(insights, 421, false)).toEqual([])
  })

  test("odd or missing data gives no chips", () => {
    expect(rowChips(null, 412, true)).toEqual([])
    expect(rowChips({}, 412, true)).toEqual([])
    expect(rowChips({ moved: { "1": { from: "open", to: "open" } }, notes: { "1": [{ kind: "duplicate", of: 1 }] } }, 1, true)).toEqual([])
  })

  test("momentum and duplicate lookups", () => {
    expect(momentum(insights, 412)).toBe(24)
    expect(momentum(insights, 366)).toBe(0)
    expect(momentum(insights, 1)).toBeNull()
    expect(momentum(null, 412)).toBeNull()
    expect(duplicateOf(insights, 433)).toBe(412)
    expect(duplicateOf(insights, 412)).toBeUndefined()
  })
})

describe("ui2 insights fetch", () => {
  test("asks for the visible numbers, at most 50", async () => {
    httpMock.alwaysOk()
    const get = jest.fn(() => Promise.resolve({ ok: true, data: insights }))
    http.get = get as unknown as typeof http.get
    const numbers = Array.from({ length: 60 }, (_, i) => i + 1)
    expect(await fetchInsights(numbers)).toEqual(insights)
    const url = (get.mock.calls[0] as unknown as string[])[0]
    expect(url.startsWith("/_api/ui2/board-insights?numbers=1,2,3")).toBe(true)
    expect(url.split("=")[1].split(",")).toHaveLength(50)
  })

  test("a 404 or error answer degrades to null", async () => {
    http.get = jest.fn(() => Promise.resolve({ ok: false, data: { errors: [] } })) as unknown as typeof http.get
    expect(await fetchInsights([1])).toBeNull()
    expect(await fetchBriefing()).toBeNull()
  })

  test("a thrown request (network, non-JSON 404) degrades to null", async () => {
    http.get = jest.fn(() => Promise.reject(new Error("boom"))) as unknown as typeof http.get
    expect(await fetchInsights([1])).toBeNull()
    expect(await fetchBriefing()).toBeNull()
  })

  test("no rows, no request", async () => {
    const get = jest.fn()
    http.get = get as unknown as typeof http.get
    expect(await fetchInsights([])).toBeNull()
    expect(get).not.toHaveBeenCalled()
  })
})
