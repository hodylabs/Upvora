import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { Fider, FiderContext, http, cache } from "@fider/services"
import { Post } from "@fider/models"
import HomePage, { NUDGE_KEY } from "./Home.page"
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

const fiderAs = (role: "visitor" | "member" | "staff") =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en" },
    tenant: { welcomeMessage: "Hello", statuses: [] },
    user: role === "visitor" ? undefined : { name: "Ada Lovelace", isCollaborator: role === "staff", isAdministrator: false },
  })

const renderHome = (role: "visitor" | "member" | "staff", posts: Post[]) =>
  render(
    <FiderContext.Provider value={fiderAs(role)}>
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

  test("staff get the full table with Vora notes from the insights", async () => {
    const { container } = renderHome("staff", [post(1), post(2)])
    expect(screen.getAllByRole("columnheader")).toHaveLength(7)
    await waitFor(() => expect(container.querySelector('[data-chip="similar"]')).not.toBeNull())
    const merge = container.querySelector('[data-chip="duplicate"]') as HTMLAnchorElement
    expect(merge.getAttribute("href")).toBe("/posts/2/idea-2#merge=1")
    expect(container.querySelector(".u2-tr__week")?.textContent).toBe("+4")
  })

  test("visitors get votes, idea and status, and the dismissible nudge", async () => {
    const { container } = renderHome("visitor", [post(1)])
    await act(() => Promise.resolve())
    expect(screen.getAllByRole("columnheader")).toHaveLength(3)
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
})
