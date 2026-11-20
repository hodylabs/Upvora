import React from "react"
import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import { httpMock } from "@fider/services/testing"
import ManageAIPage, { agentList } from "./ManageAI.page"
import ManageMCPPage from "./ManageMCP.page"
import ManageBillingPage, { billingState } from "./ManageBilling.page"
import { toBand } from "./ScorecardSettings.page"
import { ScorecardFields, csvToChoices, choicesToCsv, weightSum } from "../components/ScorecardFields"
import { ScorecardField } from "@fider/models"
import { i18n } from "@lingui/core"

// Trans renders empty under jest (@lingui/react is mocked), so these assert calls and structure.

const admin = (tenant: Record<string, unknown> = {}) =>
  Fider.initialize({
    page: "Administration/pages/ManageAI.page",
    settings: { environment: "development", oauth: [], baseURL: "http://demo.test", version: "1.0.0" },
    tenant: { name: "Demo", products: [], ...tenant },
    user: { name: "Ada", role: "administrator", isAdministrator: true, isCollaborator: true },
  })

const withFider = (el: React.ReactElement, tenant?: Record<string, unknown>) =>
  render(<FiderContext.Provider value={admin(tenant)}>{el}</FiderContext.Provider>)

const aiProps = (over: Record<string, unknown> = {}) => ({
  agents: [],
  enabled: true,
  provider: "claude",
  model: "sonnet-5",
  customBaseUrl: "",
  customModel: "",
  hasKey: true,
  webSearchEnabled: false,
  webSearchProvider: "serper",
  webSearchBaseUrl: "",
  webSearchHasKey: false,
  ...over,
})

const keyInput = (c: HTMLElement) => c.querySelector('input[name="apiKey"]') as HTMLInputElement
const saveAI = (c: HTMLElement) => c.querySelector(".u2-actions .u2-btn--primary") as HTMLButtonElement
const aiPosts = (post: jest.Mock) => post.mock.calls.filter((c) => c[0] === "/_api/admin/settings/ai").map((c) => c[1])

describe("ui2 Admin AI: keys are write-only", () => {
  beforeEach(() => httpMock.alwaysOk())

  test("a stored key is never prefilled and an empty field sends no new key", async () => {
    const { container } = withFider(<ManageAIPage {...aiProps()} />)
    expect(keyInput(container).value).toBe("")
    expect(container.querySelector('[data-testid="u2-ai-keyset"]')).not.toBeNull()
    await act(async () => fireEvent.click(saveAI(container)))
    expect(aiPosts(http.post as jest.Mock)[0]).toMatchObject({ provider: "claude", apiKey: "", model: "sonnet-5" })
  })

  test("typing a key sends it once, then the field empties again", async () => {
    const { container } = withFider(<ManageAIPage {...aiProps({ hasKey: false })} />)
    fireEvent.change(keyInput(container), { target: { value: "sk-new" } })
    await act(async () => fireEvent.click(saveAI(container)))
    expect(aiPosts(http.post as jest.Mock)[0]).toMatchObject({ apiKey: "sk-new" })
    expect(keyInput(container).value).toBe("")
    expect(container.querySelector('[data-testid="u2-ai-keyset"]')).not.toBeNull()
  })

  test("reveal is offered only for a custom provider with a saved key", async () => {
    expect(withFider(<ManageAIPage {...aiProps()} />).container.querySelector('[data-act="reveal"]')).toBeNull()
    expect(withFider(<ManageAIPage {...aiProps({ provider: "custom", hasKey: false })} />).container.querySelector('[data-act="reveal"]')).toBeNull()

    const get = jest.fn((url: string) => Promise.resolve({ ok: true, data: url.endsWith("/ai/key") ? { apiKey: "local-key" } : null }))
    http.get = get as unknown as typeof http.get
    const { container } = withFider(<ManageAIPage {...aiProps({ provider: "custom" })} />)
    expect(keyInput(container).value).toBe("")
    await act(async () => fireEvent.click(container.querySelector('[data-act="reveal"]') as HTMLButtonElement))
    expect(get).toHaveBeenCalledWith("/_api/admin/settings/ai/key")
    expect(keyInput(container).value).toBe("local-key")
  })

  test("switching provider resets the model to that provider's default", () => {
    const { container } = withFider(<ManageAIPage {...aiProps()} />)
    fireEvent.click(container.querySelector('input[name="provider"][value="openai"]') as HTMLInputElement)
    expect((container.querySelector('input[name="model"][value="luna"]') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(container.querySelector('input[name="provider"][value="custom"]') as HTMLInputElement)
    expect(container.querySelector('input[name="model"]')).toBeNull()
    expect(container.querySelector('input[name="customBaseUrl"]')).not.toBeNull()
  })

  test("every product gets an agent card, with the default first", () => {
    const list = agentList([{ id: 4, productId: 2, description: "d", instructions: "", enabled: true, webSearchEnabled: false }], [1, 2])
    expect(list.map((a) => a.productId)).toEqual([null, 2, 1])
    expect(list[0].enabled).toBe(true)
    expect(list[2].enabled).toBe(false)
  })
})

describe("ui2 Admin MCP", () => {
  test("a changed min role saves the whole settings object; a failed save rolls back", async () => {
    httpMock.alwaysOk()
    const post = jest.fn((url: string) => Promise.resolve({ ok: !url.endsWith("/settings/mcp"), data: null }))
    http.post = post as unknown as typeof http.post
    const { container } = withFider(<ManageMCPPage clients={[]} mcpUrl="https://demo.test/mcp" />, { mcpEnabled: true, mcpMinRole: "administrator" })
    const select = container.querySelector('select[name="minRole"]') as HTMLSelectElement
    await act(async () => fireEvent.change(select, { target: { value: "visitor" } }))
    expect(post).toHaveBeenCalledWith("/_api/admin/settings/mcp", { enabled: true, minRole: "visitor", dcrEnabled: true })
    await waitFor(() => expect(select.value).toBe("administrator"))
  })

  test("removing a client needs a second click", async () => {
    httpMock.alwaysOk()
    const client = { id: 3, clientId: "c", name: "n", redirectUris: [], createdByAdmin: false, createdAt: "" }
    const { container } = withFider(<ManageMCPPage clients={[client]} mcpUrl="" />)
    fireEvent.click(container.querySelector('[data-act="remove"]') as HTMLButtonElement)
    expect(http.delete).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(container.querySelector('[data-act="confirm"]') as HTMLButtonElement))
    expect(http.delete).toHaveBeenCalledWith("/_api/admin/mcp/clients/3")
    expect(container.querySelector('[data-client="3"]')).toBeNull()
  })
})

describe("ui2 Admin billing", () => {
  // A refused post keeps the page here (no navigation under jest) and re-enables the button.
  const refuse = () => {
    httpMock.alwaysOk()
    http.post = jest.fn(() => Promise.resolve({ ok: false, data: null })) as unknown as typeof http.post
  }
  const base = { stripeCustomerID: "", stripeSubscriptionID: "", paddleSubscriptionID: "", isPro: false }

  test("Paddle-only subscriptions are legacy, not shown as Pro", () => {
    expect(billingState({ ...base, paddleSubscriptionID: "p", isPro: true })).toEqual({ isPaddleCustomer: true, displayAsPro: false })
    expect(billingState({ ...base, paddleSubscriptionID: "p", stripeSubscriptionID: "s", isPro: true })).toEqual({
      isPaddleCustomer: false,
      displayAsPro: true,
    })
    expect(billingState(base)).toEqual({ isPaddleCustomer: false, displayAsPro: false })
  })

  test("a Paddle customer sees the migration note and three plans; upgrading posts checkout", async () => {
    refuse()
    const { container } = withFider(<ManageBillingPage {...base} paddleSubscriptionID="p" isPro={true} />)
    expect(container.querySelector('[data-testid="u2-paddle"]')).not.toBeNull()
    expect(container.querySelectorAll("[data-plan]")).toHaveLength(3)
    const pro = container.querySelector(".u2-plan--hi .u2-btn") as HTMLButtonElement
    await act(async () => fireEvent.click(pro))
    expect(http.post).toHaveBeenCalledWith("/_api/admin/billing/checkout")
  })

  test("a Stripe Pro customer manages billing in the portal", async () => {
    refuse()
    const { container } = withFider(<ManageBillingPage {...base} stripeSubscriptionID="s" isPro={true} />)
    expect(container.querySelector('[data-testid="u2-paddle"]')).toBeNull()
    await act(async () => fireEvent.click(container.querySelector(".u2-plan--hi .u2-btn") as HTMLButtonElement))
    expect(http.post).toHaveBeenCalledWith("/_api/admin/billing/portal")
  })

  test("annual billing starts a checkout only without a Stripe subscription; with one it opens the portal", async () => {
    refuse()
    const free = withFider(<ManageBillingPage {...base} />)
    await act(async () => fireEvent.click(free.container.querySelector(".u2-plan__link") as HTMLButtonElement))
    expect(http.post).toHaveBeenLastCalledWith("/_api/admin/billing/checkout/annual")
    free.unmount()

    const pro = withFider(<ManageBillingPage {...base} stripeCustomerID="c" stripeSubscriptionID="s" isPro={true} />)
    await act(async () => fireEvent.click(pro.container.querySelector(".u2-plan__link") as HTMLButtonElement))
    expect(http.post).toHaveBeenLastCalledWith("/_api/admin/billing/portal")
  })
})

describe("ui2 Admin scorecard settings", () => {
  test("an empty threshold becomes 0", () => {
    expect(toBand("")).toBe(0)
    expect(toBand("72")).toBe(72)
  })

  test("choices keep colors and buckets across edits", () => {
    const prev = [
      { value: "Yes", color: "green", bucket: "review" as const },
      { value: "No", color: "red" },
    ]
    expect(csvToChoices("Yes, No:executive, Maybe", prev)).toEqual([
      { value: "Yes", color: "green", bucket: "review" },
      { value: "No", color: "red", bucket: "executive" },
      { value: "Maybe" },
    ])
    expect(choicesToCsv(prev)).toBe("Yes:review, No")
  })

  test("a stored option holding a comma survives adding, removing and reordering other options", () => {
    const prev = [{ value: "Sales, EU", color: "blue", bucket: "review" as const }, { value: "Ops" }]
    const csv = choicesToCsv(prev)
    expect(csv).toBe("Sales, EU:review, Ops")
    expect(csvToChoices(csv + ", Legal", prev)).toEqual([{ value: "Sales, EU", color: "blue", bucket: "review" }, { value: "Ops" }, { value: "Legal" }])
    expect(csvToChoices("Legal, Sales, EU", prev)).toEqual([{ value: "Legal" }, { value: "Sales, EU", color: "blue", bucket: "review" }])
    // a new option is still split on commas
    expect(csvToChoices("Sales, US", prev)).toEqual([{ value: "Sales" }, { value: "US" }])
  })

  const sf = (id: number, key: string, extra: Partial<ScorecardField> = {}) =>
    ({ id, key, label: key, groupKey: "context", type: "text", sortOrder: id, isSystem: false, isActive: true, ...extra }) as ScorecardField

  test("a row action blocks the other actions on that row until its result is in", async () => {
    // the usage text uses a plural, which needs an active locale
    i18n.loadAndActivate({ locale: "en", messages: {} })
    let finish: (v: unknown) => void = () => undefined
    http.put = jest.fn(() => new Promise((r) => (finish = r))) as unknown as typeof http.put
    const { container } = withFider(<ScorecardFields fields={[sf(1, "a"), sf(2, "b")]} usage={{ b: 3 }} />)
    const row = container.querySelector('[data-field="b"]') as HTMLElement
    const buttons = () => Array.from(row.querySelectorAll("button"))
    const deactivate = buttons()[buttons().length - 1]
    fireEvent.click(deactivate)
    expect(http.put).toHaveBeenCalledTimes(1)
    buttons().forEach((b) => expect(b).toBeDisabled())
    fireEvent.click(row.querySelector('[aria-label="Move up"]') as HTMLElement)
    expect(http.put).toHaveBeenCalledTimes(1)
    await act(async () => finish({ ok: true, data: {} }))
    buttons().forEach((b) => expect(b).not.toBeDisabled())
    // the next action carries the new state
    http.put = jest.fn(() => Promise.resolve({ ok: true, data: {} })) as unknown as typeof http.put
    await act(async () => {
      fireEvent.click(row.querySelector('[aria-label="Move up"]') as HTMLElement)
    })
    expect(http.put).toHaveBeenCalledWith("/_api/admin/scorecard-fields/2", expect.objectContaining({ isActive: false, sortOrder: 0 }))
  })

  test("a label-only edit sends the stored choices unchanged, commas and suffixes included", async () => {
    httpMock.alwaysOk()
    const choices = [{ value: "Sales, EMEA", color: "blue" }, { value: "Escalate:review" }]
    const { container } = withFider(<ScorecardFields fields={[sf(4, "region", { type: "choice", choices })]} usage={{}} />)
    const row = container.querySelector('[data-field="region"]') as HTMLElement
    fireEvent.click(row.querySelector("button.u2-btn--ghost:not(.u2-btn--icon)") as HTMLElement)
    fireEvent.change(container.querySelector('input[name="label"]') as HTMLInputElement, { target: { value: "Sales region" } })
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    })
    expect(http.put).toHaveBeenCalledWith("/_api/admin/scorecard-fields/4", expect.objectContaining({ label: "Sales region", choices }))
  })

  test("only active score rows count toward the 100 weights", () => {
    const f = (type: ScorecardField["type"], weight: number, isActive = true) => ({ type, weight, isActive }) as ScorecardField
    expect(weightSum([f("score", 60), f("score", 40), f("score", 10, false), f("text", 50)])).toBe(100)
  })
})
