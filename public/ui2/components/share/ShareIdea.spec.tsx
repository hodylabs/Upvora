import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Fider, FiderContext, http, navigator } from "@fider/services"
import { Tenant, CurrentUser } from "@fider/models"
import { requestShare } from "../../lib/share"
import { ShareIdea } from "./ShareIdea"
import { safeRedirect, voraGate } from "./rules"

type Role = "visitor" | "member" | "collaborator" | "administrator"

const fiderAs = (role: Role, tenant: Partial<Tenant> = {}) =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en" },
    tenant: { allowedSchemes: "", statuses: [], ...tenant },
    user:
      role === "visitor"
        ? undefined
        : { id: 1, name: "Ada", isCollaborator: role !== "member", isAdministrator: role === "administrator", role: role === "member" ? "visitor" : role },
  })

const renderHost = (role: Role, tenant: Partial<Tenant> = {}) =>
  render(
    <FiderContext.Provider value={fiderAs(role, tenant)}>
      <ShareIdea />
    </FiderContext.Provider>
  )

const vora = { aiEnabled: true, aiAgents: [{ id: 1, productId: null, description: "", enabled: true }] }
const dialog = () => screen.findByRole("dialog")
const titleInput = () => document.querySelector<HTMLInputElement>('input[name="title"]')
const composer = () => document.querySelector<HTMLTextAreaElement>("#u2-share-composer")

describe("ui2 ShareIdea", () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    window.history.replaceState({}, "", "/")
    http.get = jest.fn(() => Promise.resolve({ ok: true, data: [] })) as unknown as typeof http.get
    http.post = jest.fn(() => Promise.resolve({ ok: true, data: [] })) as unknown as typeof http.post
  })

  test("claims the share event and opens with the title prefilled", async () => {
    renderHost("member")
    let claimed = false
    act(() => {
      claimed = requestShare("Dark mode for the board")
    })
    expect(claimed).toBe(true)
    await dialog()
    await waitFor(() => expect(titleInput()?.value).toBe("Dark mode for the board"))
    expect(composer()).toBeNull()
  })

  test("with Vora, the bar's text waits in the composer", async () => {
    renderHost("member", vora)
    act(() => {
      requestShare("Export to CSV")
    })
    await dialog()
    await waitFor(() => expect(composer()?.value).toBe("Export to CSV"))
  })

  test("signed out: sign in first, coming back to this page with ?share=1", () => {
    window.history.replaceState({}, "", "/p/mobile?query=dark")
    const goTo = jest.spyOn(navigator, "goTo").mockImplementation(() => undefined)
    renderHost("visitor")
    act(() => {
      expect(requestShare("dark")).toBe(true)
    })
    expect(goTo).toHaveBeenCalledWith(`/signin?redirect=${encodeURIComponent("/p/mobile?query=dark&share=1")}`)
    expect(screen.queryByRole("dialog")).toBeNull()
    goTo.mockRestore()
  })

  test("the redirect is always a same-site path", () => {
    expect(safeRedirect("/p/x?share=1")).toBe("/p/x?share=1")
    expect(safeRedirect("//evil.example/x")).toBe("/")
    expect(safeRedirect("/\\evil.example")).toBe("/")
    expect(safeRedirect("https://evil.example")).toBe("/")
  })

  test("?share=1 after sign in reopens it and leaves the URL clean", async () => {
    window.history.replaceState({}, "", "/?query=dark&share=1")
    renderHost("member")
    await dialog()
    expect(location.search).toBe("?query=dark")
  })

  test("read-only sites leave the event unclaimed", () => {
    const fider = fiderAs("member")
    const spy = jest.spyOn(fider, "isReadOnly", "get").mockReturnValue(true)
    render(
      <FiderContext.Provider value={fider}>
        <ShareIdea />
      </FiderContext.Provider>
    )
    expect(requestShare("x")).toBe(false)
    spy.mockRestore()
  })

  test("Vora finalizes, then create carries the brief and the voraToken", async () => {
    const posts: { url: string; body: Record<string, unknown> }[] = []
    http.post = jest.fn((url: string, body: Record<string, unknown>) => {
      posts.push({ url, body })
      if (url === "/api/v1/ai/ideate") return Promise.resolve({ ok: true, data: { reply: "Got it.", ready: true } })
      if (url === "/api/v1/ai/finalize")
        return Promise.resolve({
          ok: true,
          data: { title: "Export ideas to CSV", description: "A CSV export.", brief: "## Problem\nNo export.", tags: [], voraToken: "tok-1" },
        })
      return Promise.resolve({ ok: true, data: { id: 9, number: 42, slug: "export-ideas-to-csv", isApproved: true } })
    }) as unknown as typeof http.post

    const goTo = jest.spyOn(navigator, "goTo").mockImplementation(() => undefined)
    renderHost("member", { ...vora, voraRequired: true })
    act(() => {
      requestShare("")
    })
    await dialog()
    // Vora is required: no plain form before the draft.
    expect(titleInput()).toBeNull()
    await waitFor(() => expect(composer()).not.toBeNull())
    const box = composer() as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "We need a CSV export" } })
    fireEvent.keyDown(box, { key: "Enter" })

    await waitFor(() => expect(titleInput()?.value).toBe("Export ideas to CSV"))
    fireEvent.click(document.querySelector(".u2-dlg__foot .u2-btn--primary") as HTMLElement)

    await waitFor(() => expect(posts.some((p) => p.url === "/api/v1/posts")).toBe(true))
    const create = posts.find((p) => p.url === "/api/v1/posts")?.body
    expect(create).toMatchObject({ title: "Export ideas to CSV", briefMarkdown: "## Problem\nNo export.", voraToken: "tok-1" })
    expect(create?.voraTranscript).toEqual([
      { role: "user", content: "We need a CSV export" },
      { role: "assistant", content: "Got it." },
    ])
    expect(sessionStorage.getItem("POST_CREATED_SUCCESS")).toBe("true")
    await waitFor(() => expect(goTo).toHaveBeenCalledWith("/posts/42/export-ideas-to-csv"))
    goTo.mockRestore()
  })

  test("Shift+Enter does not send", async () => {
    renderHost("member", vora)
    act(() => {
      requestShare("")
    })
    await dialog()
    await waitFor(() => expect(composer()).not.toBeNull())
    const box = composer() as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "line one" } })
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true })
    expect(http.post).not.toHaveBeenCalled()
  })

  test("a failed turn retries once on its own, then offers Retry", async () => {
    let calls = 0
    http.post = jest.fn(() => {
      calls++
      return Promise.resolve(calls <= 2 ? { ok: false, error: { errors: [] } } : { ok: true, data: { reply: "Tell me more?", ready: false } })
    }) as unknown as typeof http.post

    renderHost("member", vora)
    act(() => {
      requestShare("")
    })
    await dialog()
    await waitFor(() => expect(composer()).not.toBeNull())
    const box = composer() as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: "An idea" } })
    fireEvent.keyDown(box, { key: "Enter" })

    await waitFor(() => expect(document.querySelector(".u2-share__fail button")).not.toBeNull(), { timeout: 4000 })
    const retry = document.querySelector(".u2-share__fail button") as HTMLElement
    expect(calls).toBe(2)
    // The person's message stays in the log.
    expect(document.querySelector(".u2-share__msg--you")?.textContent).toBe("An idea")
    fireEvent.click(retry)
    await waitFor(() => expect(document.querySelectorAll(".u2-share__msg--vora")).toHaveLength(2))
    expect(calls).toBe(3)
    expect(document.querySelector(".u2-share__fail")).toBeNull()
  }, 10000)

  test("Esc on a non-empty draft asks before discarding", async () => {
    renderHost("member")
    act(() => {
      requestShare("Something worth keeping")
    })
    await dialog()
    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.getAllByRole("dialog")).toHaveLength(2))
  })

  test("the site's share instructions render as sanitized Markdown, not raw text", async () => {
    renderHost("member", { shareIdeaInstructions: "**Read this** first <img src=x onerror=alert(1)>" })
    act(() => {
      requestShare("")
    })
    await dialog()
    const box = document.querySelector(".u2-share__instructions") as HTMLElement
    expect(box.querySelector("strong")?.textContent).toBe("Read this")
    expect(box.innerHTML).not.toContain("**")
    expect(box.querySelector("img")).toBeNull()
  })

  test("opened on a product board, the dialog starts on that board's product", async () => {
    window.history.replaceState({}, "", "/p/kahalia")
    const products = [
      { id: 1, slug: "upvora", name: "Upvora", isActive: true },
      { id: 2, slug: "kahalia", name: "Kahalia", isActive: true },
    ]
    renderHost("member", { products } as unknown as Partial<Tenant>)
    act(() => {
      requestShare("")
    })
    await dialog()
    expect(document.querySelector<HTMLSelectElement>('select[name="productId"]')?.value).toBe("2")
  })

  test("on the main board the dialog starts on the first product, as classic", async () => {
    const products = [
      { id: 1, slug: "upvora", name: "Upvora", isActive: true },
      { id: 2, slug: "kahalia", name: "Kahalia", isActive: true },
    ]
    renderHost("member", { products } as unknown as Partial<Tenant>)
    act(() => {
      requestShare("")
    })
    await dialog()
    expect(document.querySelector<HTMLSelectElement>('select[name="productId"]')?.value).toBe("1")
  })
})

describe("ui2 share: when the plain form is allowed", () => {
  const user = (role: "member" | "collaborator" | "administrator") =>
    ({ isCollaborator: role !== "member", isAdministrator: role === "administrator" }) as CurrentUser
  const tenant = (t: Partial<Tenant>) => ({ aiEnabled: true, aiAgents: [{ id: 1, productId: 5, description: "", enabled: true }], ...t }) as Tenant

  // [voraRequired, role, bypassAdmins, bypassCollaborators, product with an agent, form allowed]
  const cases: [boolean, "member" | "collaborator" | "administrator", boolean, boolean, boolean, boolean][] = [
    [false, "member", false, false, true, true],
    [true, "member", false, false, true, false],
    [true, "member", true, true, true, false],
    [true, "member", false, false, false, true],
    [true, "administrator", true, false, true, true],
    [true, "administrator", false, true, true, false],
    [true, "collaborator", false, true, true, true],
    [true, "collaborator", true, false, true, false],
    [true, "collaborator", false, false, false, true],
    [false, "administrator", false, false, true, true],
  ]

  test.each(cases)("require %s, %s, admin bypass %s, collaborator bypass %s, agent %s: form %s", (required, role, byA, byC, agent, allowed) => {
    const gate = voraGate(tenant({ voraRequired: required, voraBypassAdmins: byA, voraBypassCollaborators: byC }), user(role), agent ? 5 : 6)
    expect(!gate.required).toBe(allowed)
    expect(gate.available).toBe(agent)
  })

  test("the site default agent serves every product; AI off serves none", () => {
    const withDefault = tenant({ voraRequired: true, aiAgents: [{ id: 2, productId: null, description: "", enabled: true }] })
    expect(voraGate(withDefault, user("member"), 77).required).toBe(true)
    expect(voraGate({ ...withDefault, aiEnabled: false }, user("member"), 77)).toEqual({ available: false, required: false })
  })
})
