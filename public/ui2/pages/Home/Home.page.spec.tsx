import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { Fider, FiderContext, http, cache } from "@fider/services"
import { Post } from "@fider/models"
import HomePage, { NUDGE_KEY, WELCOME_SETTING } from "./Home.page"
import { messageSize } from "./Welcome"
import { SHARE_IDEA_EVENT } from "../../lib/share"
import { toast } from "../../components/feedback/toast"

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

const fiderAs = (role: "visitor" | "member" | "staff", welcomeMessage = "Hello") =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en" },
    tenant: { welcomeMessage, statuses: [] },
    user: role === "visitor" ? undefined : { name: "Ada Lovelace", isCollaborator: role === "staff", isAdministrator: false },
  })

const renderHome = (role: "visitor" | "member" | "staff", posts: Post[], welcomeMessage?: string) =>
  render(
    <FiderContext.Provider value={fiderAs(role, welcomeMessage)}>
      <HomePage posts={posts} tags={[]} searchNoiseWords={[]} countPerStatus={{ open: posts.length || 1 }} />
    </FiderContext.Provider>
  )

const insights = { momentum: { "1": 4 }, notes: { "1": [{ kind: "similar", count: 2 }], "2": [{ kind: "duplicate", of: 1 }] } }

describe("ui2 Home page", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/")
    cache.local.remove(NUDGE_KEY)
    http.get = jest.fn((url: string) =>
      Promise.resolve(url.startsWith("/_api/ui2/board-insights") ? { ok: true, data: insights } : { ok: false, data: {} })
    ) as unknown as typeof http.get
  })

  test("rows carry the number, this week's gain, the heat bar and Vora notes", async () => {
    const { container } = renderHome("staff", [post(1, { votesCount: 10 }), post(2, { votesCount: 5 })])
    await waitFor(() => expect(container.querySelector('[data-chip="similar"]')).not.toBeNull())
    const merge = container.querySelector('[data-chip="duplicate"]') as HTMLAnchorElement
    expect(merge.getAttribute("href")).toBe("/posts/2/idea-2#merge=1")
    expect(container.querySelectorAll(".u2-tr__week")).toHaveLength(1)
    expect(container.querySelector('.u2-tr[data-number="1"] .u2-tr__week')).not.toBeNull()
    expect(container.querySelector(".u2-tr__num")?.textContent).toBe("#1")
    const heat = Array.from(container.querySelectorAll<HTMLElement>(".u2-heat i")).map((i) => i.style.inlineSize)
    expect(heat).toEqual(["100%", "50%"])
  })

  test("a click anywhere on a row opens the idea; links in it keep their own behavior", async () => {
    window.scrollTo = jest.fn()
    const { container } = renderHome("member", [post(1), post(2)])
    await act(() => Promise.resolve())
    fireEvent.click(container.querySelector('.u2-tr[data-index="1"] .u2-tr__meta') as HTMLElement)
    expect(window.location.pathname).toBe("/posts/2/idea-2")
  })

  test("visitors get the list and the dismissible nudge", async () => {
    const { container } = renderHome("visitor", [post(1)])
    await act(() => Promise.resolve())
    expect(screen.getAllByRole("listitem")).toHaveLength(1)
    expect(container.querySelector(".u2-nudge")).not.toBeNull()
    fireEvent.click(container.querySelector(".u2-nudge button") as HTMLElement)
    expect(container.querySelector(".u2-nudge")).toBeNull()
    expect(cache.local.get(NUDGE_KEY)).toBe("true")
  })

  test("members who voted get no nudge; your vote marks the row", async () => {
    const { container } = renderHome("member", [post(1, { hasVoted: true })])
    await act(() => Promise.resolve())
    expect(container.querySelector(".u2-nudge")).toBeNull()
    expect(container.querySelector(".u2-tr.is-mine")).not.toBeNull()
  })

  test("a failed insights call leaves the board working, without notes", async () => {
    http.get = jest.fn(() => Promise.reject(new Error("404"))) as unknown as typeof http.get
    const { container } = renderHome("staff", [post(1), post(2)])
    await act(() => Promise.resolve())
    expect(container.querySelectorAll(".u2-tr")).toHaveLength(2)
    expect(container.querySelector("[data-chip]")).toBeNull()
  })

  test("an empty search offers to share it, through the share event", async () => {
    window.history.replaceState({}, "", "/?query=outlook")
    const { container } = renderHome("member", [])
    await act(() => Promise.resolve())
    const button = container.querySelector(".u2-empty .u2-btn--primary") as HTMLElement
    expect(button).not.toBeNull()

    // The share host claims the event; the board shows no fallback note.
    const handler = jest.fn((e: Event) => e.preventDefault())
    window.addEventListener(SHARE_IDEA_EVENT, handler)
    fireEvent.click(button)
    expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ title: "outlook" })
    expect(handler.mock.calls[0][0].defaultPrevented).toBe(true)
    expect(screen.queryByRole("status")).toBeNull()
    window.removeEventListener(SHARE_IDEA_EVENT, handler)
  })

  test("an unclaimed share click shows an error toast", async () => {
    const error = jest.spyOn(toast, "error").mockImplementation(() => 0)
    window.history.replaceState({}, "", "/?query=outlook")
    const { container } = renderHome("member", [])
    await act(() => Promise.resolve())
    fireEvent.click(container.querySelector(".u2-empty .u2-btn--primary") as HTMLElement)
    expect(error).toHaveBeenCalledTimes(1)
    error.mockRestore()
  })

  test("By stage groups the ideas by status, folds closed kinds, and keeps the layout in the URL", async () => {
    const all = [post(1), post(2, { status: "planned" }), post(3, { status: "completed" })]
    http.get = jest.fn((url: string) =>
      Promise.resolve(url.startsWith("/api/v1/posts") ? { ok: true, data: all } : { ok: false, data: {} })
    ) as unknown as typeof http.get
    const { container } = renderHome("member", [post(1)])
    // The layout switch: List, then By stage.
    fireEvent.click(container.querySelectorAll(".u2-seg")[0].querySelectorAll("button")[1])
    await waitFor(() => expect(container.querySelector('.u2-tr[data-number="2"]')).not.toBeNull())
    expect(window.location.search).toContain("layout=stage")
    // By stage asks for every status, closed kinds included.
    const search = (http.get as jest.Mock).mock.calls.map((c) => c[0] as string).find((u) => u.startsWith("/api/v1/posts")) || ""
    expect(search).toContain("completed")
    const shipped = screen.getByRole("button", { name: /Completed/ })
    expect(shipped.getAttribute("aria-expanded")).toBe("false")
    expect(screen.getByRole("button", { name: /Planned/ }).getAttribute("aria-expanded")).toBe("true")
    // Folded groups are left out of the keyboard order.
    expect(Array.from(container.querySelectorAll(".u2-tr")).map((r) => r.getAttribute("data-number"))).toEqual(["1", "2"])
    fireEvent.click(shipped)
    expect(shipped.getAttribute("aria-expanded")).toBe("true")
    expect(container.querySelector('.u2-tr[data-number="3"]')?.getAttribute("data-index")).toBe("2")
  })

  test("the welcome card sizes itself by the message, and staff get Edit or Add a message", async () => {
    const short = renderHome("staff", [post(1)])
    await act(() => Promise.resolve())
    expect(short.container.querySelector(".u2-welcome.is-short")).not.toBeNull()
    expect(short.container.querySelector(".u2-welcome__edit")?.getAttribute("href")).toBe(WELCOME_SETTING)
    short.unmount()

    const none = renderHome("staff", [post(1)], "")
    await act(() => Promise.resolve())
    expect(none.container.querySelector(".u2-welcome.is-none")).not.toBeNull()
    expect(none.container.querySelector(".u2-welcome__add")?.getAttribute("href")).toBe(WELCOME_SETTING)
    none.unmount()

    const member = renderHome("member", [post(1)], "")
    await act(() => Promise.resolve())
    expect(member.container.querySelector(".u2-welcome__add, .u2-welcome__edit")).toBeNull()
  })

  test("a long message clamps with a Read more button that toggles", async () => {
    const tall = jest.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(400)
    const { container } = renderHome("member", [post(1)], "word ".repeat(80))
    await act(() => Promise.resolve())
    expect(container.querySelector(".u2-welcome.is-long")).not.toBeNull()
    const more = container.querySelector(".u2-welcome__more") as HTMLElement
    expect(more.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(more)
    expect(more.getAttribute("aria-expanded")).toBe("true")
    expect(container.querySelector(".u2-welcome.is-open")).not.toBeNull()
    tall.mockRestore()
  })

  test("messageSize: none, short headline, long text", () => {
    expect(messageSize("")).toBe("none")
    expect(messageSize("<p> </p>")).toBe("none")
    expect(messageSize("<p>Tell us what would make your work easier.</p>")).toBe("short")
    expect(messageSize(`<p>${"a".repeat(141)}</p>`)).toBe("long")
    expect(messageSize("<h2>Hi</h2><p>Short.</p>")).toBe("long")
  })
})
