import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { Fider, FiderContext, http, cache, navigator } from "@fider/services"
import { Post, Tenant } from "@fider/models"
import HomePage, { WELCOME_SETTING, strongMatch } from "./Home.page"
import { TEAM_VIEW_KEY } from "./useTeamView"
import { DRAFT_KEYS } from "../../components/share/rules"

const post = (number: number, extra: Partial<Post> = {}): Post =>
  ({
    id: number,
    number,
    slug: `idea-${number}`,
    title: `Idea ${number}`,
    description: "",
    createdAt: "2026-11-01T00:00:00Z",
    status: "open",
    user: { id: 1, name: "Ada", avatarURL: "" },
    hasVoted: false,
    response: null,
    votesCount: 3,
    commentsCount: 1,
    tags: [],
    isApproved: true,
    isPrivate: false,
    ...extra,
  }) as unknown as Post

type Role = "visitor" | "member" | "staff"

const fiderAs = (role: Role, tenant: Partial<Tenant> = {}) =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en" },
    tenant: { welcomeMessage: "Hello", statuses: [], ...tenant },
    user: role === "visitor" ? undefined : { id: 1, name: "Ada Lovelace", isCollaborator: role === "staff", isAdministrator: false },
  })

const renderHome = (role: Role, posts: Post[], tenant: Partial<Tenant> = {}) =>
  render(
    <FiderContext.Provider value={fiderAs(role, tenant)}>
      <HomePage posts={posts} tags={[]} searchNoiseWords={[]} countPerStatus={{ open: posts.length || 1 }} />
    </FiderContext.Provider>
  )

const vora = { aiEnabled: true, aiAgents: [{ id: 1, productId: null, description: "", enabled: true }] } as unknown as Partial<Tenant>
const insights = {
  momentum: { "1": 4 },
  notes: { "1": [{ kind: "similar", count: 2 }], "2": [{ kind: "duplicate", of: 1 }] },
  voters: { "1": [{ name: "Grace", avatarURL: "/a.png" }] },
}
const briefing = { since: "2026-11-20T10:00:00Z", firstVisit: false, newIdeas: 2, statusMoves: 0, votedMoved: 1, duplicates: 0 }

// Routes GET calls: search results, similar ideas, insights, briefing, one idea.
const mockGet = (routes: { search?: Post[]; similar?: Post[]; one?: Post } = {}) => {
  http.get = jest.fn((url: string) => {
    if (url.startsWith("/_api/ui2/board-insights")) return Promise.resolve({ ok: true, data: insights })
    if (url.startsWith("/_api/ui2/briefing")) return Promise.resolve({ ok: true, data: briefing })
    if (url.startsWith("/api/v1/similarposts")) return Promise.resolve({ ok: true, data: routes.similar || [] })
    if (/^\/api\/v1\/posts\/\d+/.test(url)) return Promise.resolve(routes.one ? { ok: true, data: routes.one } : { ok: false, data: {} })
    if (url.startsWith("/api/v1/posts")) return Promise.resolve({ ok: true, data: routes.search || [] })
    return Promise.resolve({ ok: false, data: {} })
  }) as unknown as typeof http.get
}
const gets = (prefix: string) => (http.get as jest.Mock).mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith(prefix))

const box = () => screen.getByRole("searchbox") as HTMLInputElement
const shareButton = () => document.querySelector(".u2-box__share") as HTMLElement
const composer = () => document.querySelector<HTMLTextAreaElement>("#u2-share-composer")
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })

describe("ui2 Home page", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/")
    localStorage.clear()
    sessionStorage.clear()
    mockGet()
    http.post = jest.fn(() => Promise.resolve({ ok: true, data: { id: 9, number: 9, title: "x", slug: "x", isApproved: true } })) as unknown as typeof http.post
  })

  test("rows carry the number, comments and this week's gain; the vote button stays", async () => {
    const { container } = renderHome("member", [post(1, { votesCount: 10 }), post(2, { votesCount: 5 })])
    await waitFor(() => expect(container.querySelector(".u2-tr__week")).not.toBeNull())
    expect(container.querySelectorAll(".u2-tr__week")).toHaveLength(1)
    expect(container.querySelector('.u2-tr[data-number="1"] .u2-tr__week')).not.toBeNull()
    expect(container.querySelector(".u2-tr__num")?.textContent).toBe("#1")
    expect(container.querySelector(".u2-tr__cmts")).not.toBeNull()
    expect(container.querySelector('.u2-tr[data-number="1"] .u2-vote')?.getAttribute("aria-pressed")).toBe("false")
  })

  test("Team view extras (notes, faces, flags, Merge) are hidden for visitors and staff with it off", async () => {
    const rows = [post(1), post(2, { isApproved: false, isPrivate: true })]
    const visitor = renderHome("visitor", rows)
    await waitFor(() => expect(visitor.container.querySelector(".u2-tr__week")).not.toBeNull())
    expect(visitor.container.querySelector("[data-chip], [data-flag], .u2-faces")).toBeNull()
    visitor.unmount()

    const off = renderHome("staff", rows)
    await waitFor(() => expect(off.container.querySelector(".u2-tr__week")).not.toBeNull())
    expect(off.container.querySelector("[data-chip], [data-flag], .u2-faces")).toBeNull()
    expect(off.container.querySelector(".u2-hero__edit")).toBeNull()
    off.unmount()

    localStorage.setItem(TEAM_VIEW_KEY, "true")
    const on = renderHome("staff", rows)
    await waitFor(() => expect(on.container.querySelector('[data-chip="similar"]')).not.toBeNull())
    expect(on.container.querySelector('[data-chip="duplicate"]')?.getAttribute("href")).toBe("/posts/2/idea-2#merge=1")
    expect(on.container.querySelector('[data-flag="pending"]')).not.toBeNull()
    expect(on.container.querySelector('[data-flag="private"]')).not.toBeNull()
    expect(on.container.querySelector(".u2-faces")).not.toBeNull()
    expect(on.container.querySelector(".u2-hero__edit")?.getAttribute("href")).toBe(WELCOME_SETTING)
  })

  test("Team view does nothing for members, even with the stored switch on", async () => {
    localStorage.setItem(TEAM_VIEW_KEY, "true")
    const { container } = renderHome("member", [post(1), post(2)])
    await waitFor(() => expect(container.querySelector(".u2-tr__week")).not.toBeNull())
    expect(container.querySelector("[data-chip], .u2-faces, .u2-hero__edit")).toBeNull()
  })

  test("a click anywhere on a row opens the idea", async () => {
    window.scrollTo = jest.fn()
    const { container } = renderHome("member", [post(1), post(2)])
    await act(() => Promise.resolve())
    fireEvent.click(container.querySelector('.u2-tr[data-index="1"] .u2-tr__meta') as HTMLElement)
    expect(window.location.pathname).toBe("/posts/2/idea-2")
  })

  test("typing filters the list live through the search, keeping only the latest answer", async () => {
    mockGet({ search: [post(7, { title: "Dark mode" })] })
    const { container } = renderHome("member", [post(1)])
    type("da")
    type("dark")
    await waitFor(() => expect(container.querySelector('.u2-tr[data-number="7"]')).not.toBeNull())
    const searches = gets("/api/v1/posts")
    // Debounced: one call, for the last text.
    expect(searches).toHaveLength(1)
    expect(searches[0]).toContain("query=dark")
    expect(container.querySelector('.u2-tr[data-number="1"]')).toBeNull()
  })

  test("Enter posts the typed text directly as a new idea, which lands on top", async () => {
    const created = post(9, { title: "Dark mode for the board" })
    mockGet({ search: [post(1)], one: created })
    const { container } = renderHome("member", [post(1)])
    type("Dark mode for the board")
    fireEvent.keyDown(box(), { key: "Enter" })
    await waitFor(() => expect(screen.getByRole("status").getAttribute("data-state")).toBe("live"))
    const [url, body] = (http.post as jest.Mock).mock.calls[0]
    expect(url).toBe("/api/v1/posts")
    expect(body).toMatchObject({ title: "Dark mode for the board", description: "" })
    await waitFor(() => expect(container.querySelector('.u2-tr[data-index="0"]')?.getAttribute("data-number")).toBe("9"))
    expect(box().value).toBe("")
  })

  test("a pending idea says it waits for approval; server errors show inline", async () => {
    http.post = jest.fn(() =>
      Promise.resolve({ ok: true, data: { id: 9, number: 9, title: "x", slug: "x", isApproved: false } })
    ) as unknown as typeof http.post
    renderHome("member", [post(1)])
    type("Dark mode for the board")
    fireEvent.click(shareButton())
    await waitFor(() => expect(screen.getByRole("status").getAttribute("data-state")).toBe("pending"))

    http.post = jest.fn(() =>
      Promise.resolve({ ok: false, data: {}, error: { errors: [{ field: "title", message: "Title is taken" }] } })
    ) as unknown as typeof http.post
    type("Dark mode for the board")
    fireEvent.click(shareButton())
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Title is taken"))
  })

  test("a short title is refused inline; empty Share focuses the box", async () => {
    renderHome("member", [post(1)])
    fireEvent.click(shareButton())
    expect(document.activeElement).toBe(box())
    type("dark")
    fireEvent.keyDown(box(), { key: "Enter" })
    expect(screen.getByRole("alert").textContent).toContain("at least 10 characters")
    expect(http.post).not.toHaveBeenCalled()
  })

  test("signed out: Share goes to sign in, keeping the text for the share dialog", () => {
    const goTo = jest.spyOn(navigator, "goTo").mockImplementation(() => undefined)
    renderHome("visitor", [post(1)])
    type("Dark mode for the board")
    fireEvent.keyDown(box(), { key: "Enter" })
    expect(goTo).toHaveBeenCalledWith(expect.stringMatching(/^\/signin\?redirect=.*share%3D1/))
    expect(cache.local.get(DRAFT_KEYS.TITLE)).toBe("Dark mode for the board")
    expect(http.post).not.toHaveBeenCalled()
    goTo.mockRestore()
  })

  test("read-only sites hide Share and Ask Vora", async () => {
    renderHome("member", [post(1)], { status: 3, ...vora } as Partial<Tenant>)
    await act(() => Promise.resolve())
    expect(document.querySelector(".u2-box__share, .u2-box__ask")).toBeNull()
  })

  test("when the site requires Vora, Share opens the inline chat with the text instead of posting", async () => {
    renderHome("member", [post(1)], { ...vora, voraRequired: true } as Partial<Tenant>)
    type("Dark mode for the board")
    fireEvent.click(shareButton())
    await waitFor(() => expect(composer()).not.toBeNull())
    expect(composer()?.value).toBe("Dark mode for the board")
    expect(http.post).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Close Vora" }))
    expect(composer()).toBeNull()
  })

  test("Ask Vora shows only where Vora serves, and opens the chat inline", async () => {
    const off = renderHome("member", [post(1)])
    expect(document.querySelector(".u2-box__ask")).toBeNull()
    off.unmount()
    renderHome("member", [post(1)], vora)
    type("export to csv")
    fireEvent.click(document.querySelector(".u2-box__ask") as HTMLElement)
    await waitFor(() => expect(composer()?.value).toBe("export to csv"))
  })

  test("no match: an inline card shares the typed title with optional details", async () => {
    mockGet({ search: [], one: post(9, { title: "Export a board to CSV" }) })
    const { container } = renderHome("member", [post(1)])
    type("Export a board to CSV")
    await waitFor(() => expect(container.querySelector(".u2-card")).not.toBeNull())
    expect(container.querySelector(".u2-card__title")?.textContent).toBe("Export a board to CSV")
    fireEvent.change(container.querySelector("#u2-card-details") as HTMLElement, { target: { value: "For the monthly report" } })
    fireEvent.click(container.querySelector(".u2-card .u2-btn--primary") as HTMLElement)
    await waitFor(() => expect(http.post).toHaveBeenCalled())
    expect((http.post as jest.Mock).mock.calls[0][1]).toMatchObject({ title: "Export a board to CSV", description: "For the monthly report" })
  })

  test("on the all-products board the card picks the product; details survive a retyped title", async () => {
    mockGet({ search: [] })
    const products = [
      { id: 1, name: "Web", slug: "web" },
      { id: 2, name: "Mobile", slug: "mobile" },
    ]
    const { container } = renderHome("member", [post(1)], { products } as unknown as Partial<Tenant>)
    type("Export a board to CSV")
    await waitFor(() => expect(container.querySelector(".u2-card select")).not.toBeNull())
    fireEvent.change(container.querySelector(".u2-card select") as HTMLElement, { target: { value: "2" } })
    fireEvent.change(container.querySelector("#u2-card-details") as HTMLElement, { target: { value: "Monthly" } })
    type("Export a board to CSV file")
    fireEvent.keyDown(box(), { key: "Enter" })
    await waitFor(() => expect(http.post).toHaveBeenCalled())
    expect((http.post as jest.Mock).mock.calls[0][1]).toMatchObject({ title: "Export a board to CSV file", description: "Monthly", productId: 2 })
  })

  test("the card offers Make private under classic's rule, and sends the choice", async () => {
    mockGet({ search: [] })
    const plain = renderHome("member", [post(1)])
    type("Export a board to CSV")
    await waitFor(() => expect(plain.container.querySelector(".u2-card")).not.toBeNull())
    expect(plain.container.querySelector(".u2-card input[type=checkbox]")).toBeNull()
    plain.unmount()

    const { container } = renderHome("member", [post(1)], { membersPrivateIdeas: true } as Partial<Tenant>)
    type("Export a board to CSV")
    await waitFor(() => expect(container.querySelector(".u2-card input[type=checkbox]")).not.toBeNull())
    fireEvent.click(container.querySelector(".u2-card input[type=checkbox]") as HTMLElement)
    fireEvent.click(container.querySelector(".u2-card .u2-btn--primary") as HTMLElement)
    await waitFor(() => expect(http.post).toHaveBeenCalled())
    expect((http.post as jest.Mock).mock.calls[0][1]).toMatchObject({ isPrivate: true })
  })

  test("Vora's match note offers Vote for it and Mine is different", async () => {
    mockGet({ search: [post(1)], similar: [post(5, { title: "Offline mode for the desktop app", votesCount: 214 })] })
    http.post = jest.fn((url: string) =>
      Promise.resolve(
        url.endsWith("/votes/toggle") ? { ok: true, data: { voted: true } } : { ok: true, data: { id: 9, number: 9, title: "x", slug: "x", isApproved: true } }
      )
    ) as unknown as typeof http.post
    renderHome("member", [post(1)], vora)
    type("offline mode please")
    const vote = await screen.findByRole("button", { name: "Vote for Offline mode for the desktop app" })
    expect(document.querySelector(".u2-match")).not.toBeNull()
    fireEvent.click(vote)
    await waitFor(() => expect((http.post as jest.Mock).mock.calls[0][0]).toBe("/api/v1/posts/5/votes/toggle"))
    fireEvent.click(document.querySelector(".u2-match__acts .u2-btn--ghost") as HTMLElement)
    await waitFor(() => expect((http.post as jest.Mock).mock.calls[1][0]).toBe("/api/v1/posts"))
  })

  test("strongMatch needs half the typed words in the title", () => {
    expect(strongMatch("offline mode please", "Offline mode for the desktop app")).toBe(true)
    expect(strongMatch("dark theme for reports", "Offline mode for the desktop app")).toBe(false)
    expect(strongMatch("a b", "anything")).toBe(false)
  })

  test("the since-your-last-visit strip shows only to signed-in people, and hides while typing", async () => {
    const visitor = renderHome("visitor", [post(1)])
    await act(() => Promise.resolve())
    expect(visitor.container.querySelector(".u2-since")).toBeNull()
    expect(gets("/_api/ui2/briefing")).toHaveLength(0)
    visitor.unmount()

    const member = renderHome("member", [post(1)])
    await waitFor(() => expect(member.container.querySelector(".u2-since")).not.toBeNull())
    expect(member.container.querySelectorAll(".u2-since a")).toHaveLength(2)
    type("dark")
    expect(member.container.querySelector(".u2-since")).toBeNull()
    type("")
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(member.container.querySelector(".u2-since")).toBeNull()
  })

  test("My votes from the URL names the view in the heading; sorts map to the server's values", async () => {
    window.history.replaceState({}, "", "/?myvotes=true")
    const { container } = renderHome("member", [post(1)])
    await act(() => Promise.resolve())
    expect(container.querySelector(".u2-controls__h")?.getAttribute("data-view")).toBe("myvotes")
    expect(screen.getByRole("button", { name: "Rising" }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.click(screen.getByRole("button", { name: "Most wanted" }))
    await waitFor(() => expect(gets("/api/v1/posts").some((u) => u.includes("view=most-wanted") && u.includes("myvotes=true"))).toBe(true))
  })

  test("By stage groups the ideas by status, folds closed kinds, and keeps the layout in the URL", async () => {
    const all = [post(1), post(2, { status: "planned" }), post(3, { status: "completed" })]
    mockGet({ search: all })
    const { container } = renderHome("member", [post(1)])
    fireEvent.click(container.querySelectorAll(".u2-seg")[0].querySelectorAll("button")[1])
    await waitFor(() => expect(container.querySelector('.u2-tr[data-number="2"]')).not.toBeNull())
    expect(window.location.search).toContain("layout=stage")
    // By stage asks for every status, closed kinds included.
    expect(gets("/api/v1/posts").pop()).toContain("completed")
    const shipped = screen.getByRole("button", { name: /Completed/ })
    expect(shipped.getAttribute("aria-expanded")).toBe("false")
    // Folded groups are left out of the keyboard order.
    expect(Array.from(container.querySelectorAll(".u2-tr")).map((r) => r.getAttribute("data-number"))).toEqual(["1", "2"])
    fireEvent.click(shipped)
    expect(container.querySelector('.u2-tr[data-number="3"]')?.getAttribute("data-index")).toBe("2")
  })

  test("/ focuses the box", async () => {
    renderHome("member", [post(1)])
    fireEvent.keyDown(document.body, { key: "/" })
    expect(document.activeElement).toBe(box())
  })
})
