import React from "react"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { Fider, FiderContext, http, notify } from "@fider/services"
import { Post, Status } from "@fider/models"
import RoadmapPage from "./Roadmap.page"
import { lanesFrom, movePost, visiblePosts } from "./lanes"

const status = (slug: string, kind = "active"): Status =>
  ({ id: slug.length, slug, label: slug, kind, showOnRoadmap: true, isActive: true }) as unknown as Status

const post = (number: number, extra: Partial<Post> = {}): Post =>
  ({
    id: number,
    number,
    slug: `idea-${number}`,
    title: `Idea ${number}`,
    description: "",
    createdAt: "2026-11-01T00:00:00Z",
    status: "planned",
    user: { id: 1, name: "Ada", avatarURL: "" },
    hasVoted: false,
    response: { text: "On it", respondedAt: "2026-11-02T00:00:00Z" },
    votesCount: 3,
    commentsCount: 2,
    tags: [],
    isApproved: true,
    isPrivate: false,
    ...extra,
  }) as unknown as Post

const columns = () => [
  { status: status("planned"), posts: [post(1, { product: { id: 7, name: "App", slug: "app", color: "" } }), post(2, { tags: ["ux"] })] },
  { status: status("started"), posts: [post(3, { status: "started", description: "Slack alerts for **ops**" })] },
  { status: status("completed", "closed-completed"), posts: [post(4, { status: "completed" })] },
]

const fiderAs = (role: "visitor" | "staff") =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en", mode: "multi" },
    tenant: { isPro: true, statuses: [], products: [{ id: 7, name: "App", slug: "app", color: "", isActive: true }] },
    user: role === "visitor" ? undefined : { name: "Ada", isCollaborator: true, isAdministrator: false },
  })

const renderRoadmap = (role: "visitor" | "staff") =>
  render(
    <FiderContext.Provider value={fiderAs(role)}>
      <RoadmapPage columns={columns()} tags={[{ id: 1, slug: "ux", name: "UX", color: "abcdef", isPublic: true } as never]} />
    </FiderContext.Provider>
  )

const lane = (container: HTMLElement, slug: string) => container.querySelector(`[data-lane="${slug}"]`) as HTMLElement
const numbersIn = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLElement>(".u2-rtile")).map((t) => Number(t.dataset.number))

describe("roadmap lanes", () => {
  test("group posts per status lane, filtered by product, tag and query", () => {
    const lanes = lanesFrom(columns())
    expect(lanes.map((l) => l.status.slug)).toEqual(["planned", "started", "completed"])
    const none = { products: [], tag: null, query: "" }
    expect(visiblePosts(lanes[0], none).map((p) => p.number)).toEqual([1, 2])
    expect(visiblePosts(lanes[0], { ...none, products: [7] }).map((p) => p.number)).toEqual([1])
    expect(visiblePosts(lanes[0], { ...none, tag: "ux" }).map((p) => p.number)).toEqual([2])
    expect(visiblePosts(lanes[1], { ...none, query: "SLACK" }).map((p) => p.number)).toEqual([3])
  })

  test("movePost puts the idea on top of the target lane and is a no-op for the same lane", () => {
    const lanes = lanesFrom(columns())
    const moved = movePost(lanes, 2, "started")
    expect(moved[0].posts.map((p) => p.number)).toEqual([1])
    expect(moved[1].posts.map((p) => p.number)).toEqual([2, 3])
    expect(moved[1].posts[0].status).toBe("started")
    expect(movePost(lanes, 2, "planned")).toBe(lanes)
    expect(movePost(lanes, 99, "started")).toBe(lanes)
  })
})

describe("ui2 Roadmap page", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/roadmap")
    http.get = jest.fn(() => Promise.resolve({ ok: true, data: [] })) as unknown as typeof http.get
  })

  test("staff move an idea with the keyboard through the Move to menu and the respond API", async () => {
    const put = jest.fn(() => Promise.resolve({ ok: true, data: {} }))
    http.put = put as unknown as typeof http.put
    const after: { [slug: string]: Post[] } = { planned: [post(1)], started: [post(2, { status: "started" }), post(3)], completed: [post(4)] }
    const get = jest.fn((url: string) => Promise.resolve({ ok: true, data: after[/statuses=(\w+)/.exec(url)?.[1] || ""] || [] }))
    http.get = get as unknown as typeof http.get
    const { container } = renderRoadmap("staff")

    const tile = container.querySelector('.u2-rtile[data-number="2"]') as HTMLElement
    const trigger = within(tile).getByRole("button", { expanded: false, name: /Move Idea 2/ })
    fireEvent.click(trigger)
    const menu = within(tile).getByRole("menu")
    const items = within(menu).getAllByRole("menuitem")
    expect(items.map((i) => i.dataset.key)).toEqual(["started", "completed"])
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(items[0], { key: "ArrowDown" })
    expect(document.activeElement).toBe(items[1])
    fireEvent.keyDown(items[1], { key: "ArrowUp" })
    fireEvent.click(document.activeElement as HTMLElement)

    expect(put).toHaveBeenCalledWith("/api/v1/posts/2/status", { status: "started", text: "On it", originalNumber: 0 })
    expect(numbersIn(lane(container, "planned"))).toEqual([1])
    expect(numbersIn(lane(container, "started"))).toEqual([2, 3])
    // Then every lane reloads from the search API at its current size.
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3))
    expect((get.mock.calls as unknown as string[][]).map((c) => c[0])).toEqual([
      expect.stringContaining("statuses=planned"),
      expect.stringContaining("statuses=started"),
      expect.stringContaining("statuses=completed"),
    ])
    await waitFor(() => expect(numbersIn(lane(container, "started"))).toEqual([2, 3]))
    expect(numbersIn(lane(container, "planned"))).toEqual([1])
  })

  test("Escape closes the Move to menu and returns focus to its button", () => {
    const { container } = renderRoadmap("staff")
    const tile = container.querySelector('.u2-rtile[data-number="1"]') as HTMLElement
    const trigger = within(tile).getByRole("button", { name: /Move Idea 1/ })
    fireEvent.click(trigger)
    fireEvent.keyDown(within(tile).getAllByRole("menuitem")[0], { key: "Escape" })
    expect(within(tile).queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  test("a refused move goes back to its lane", async () => {
    http.put = jest.fn(() => Promise.resolve({ ok: false, data: {} })) as unknown as typeof http.put
    const err = jest.spyOn(notify, "error").mockResolvedValue(undefined)
    const { container } = renderRoadmap("staff")
    const tile = container.querySelector('.u2-rtile[data-number="1"]') as HTMLElement
    fireEvent.click(within(tile).getByRole("button", { name: /Move Idea 1/ }))
    fireEvent.click(within(tile).getAllByRole("menuitem")[0])
    await waitFor(() => expect(numbersIn(lane(container, "planned"))).toEqual([1, 2]))
    expect(numbersIn(lane(container, "started"))).toEqual([3])
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })

  test("visitors get no Move to menu and no dragging; completed ideas show the date, not a vote", () => {
    const { container } = renderRoadmap("visitor")
    expect(screen.queryByRole("button", { name: /Move Idea/ })).toBeNull()
    expect(container.querySelector('.u2-rtile[draggable="true"]')).toBeNull()
    const done = container.querySelector('.u2-rtile[data-number="4"]') as HTMLElement
    expect(done.querySelector(".u2-vote")).toBeNull()
    expect(done.querySelector(".u2-rtile__done")).not.toBeNull()
  })

  test("the product chips filter lanes and write ?products to the URL", () => {
    const { container } = renderRoadmap("visitor")
    fireEvent.click(screen.getByRole("button", { name: "App", pressed: false }))
    expect(location.search).toBe("?products=app")
    expect(numbersIn(lane(container, "planned"))).toEqual([1])
    expect(numbersIn(lane(container, "started"))).toEqual([])
  })

  test("?product=<slug> from the product switcher preselects the filter", () => {
    window.history.replaceState({}, "", "/roadmap?product=app")
    renderRoadmap("visitor")
    expect(screen.getByRole("button", { name: "App" })).toHaveAttribute("aria-pressed", "true")
  })

  test("the lane header collapses its lane", () => {
    const { container } = renderRoadmap("visitor")
    const toggle = lane(container, "planned").querySelector(".u2-lane__toggle") as HTMLElement
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(container.querySelector("#u2-lane-planned")).toHaveAttribute("hidden")
  })

  test("sites without a roadmap (multi-host, not Pro) get the upsell", () => {
    const fider = Fider.initialize({
      settings: { environment: "development", oauth: [], locale: "en", mode: "multi" },
      tenant: { isPro: false },
      user: undefined,
    })
    const { container } = render(
      <FiderContext.Provider value={fider}>
        <RoadmapPage />
      </FiderContext.Provider>
    )
    expect(container.querySelector(".u2-roadmap__blank")).not.toBeNull()
    expect(container.querySelector(".u2-lane")).toBeNull()
  })
})
