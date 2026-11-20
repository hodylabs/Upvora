import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import { Post } from "@fider/models"
import ShowPostPage from "./ShowPost.page"
import HomePage from "../Home/Home.page"
import { canDeleteIdea, canEditIdea, canTogglePrivacy, mergeTarget } from "./rules"

type Role = "visitor" | "member" | "author" | "collaborator" | "admin"

const AUTHOR_ID = 2

const fiderAs = (role: Role, tenant: Record<string, unknown> = {}) =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en", baseURL: "http://test" },
    tenant: { statuses: [], allowedSchemes: "", ...tenant },
    user:
      role === "visitor"
        ? undefined
        : {
            id: role === "author" ? AUTHOR_ID : 9,
            name: "Ada Lovelace",
            role: role === "admin" ? "administrator" : role === "collaborator" ? "collaborator" : "visitor",
            isCollaborator: role === "admin" || role === "collaborator",
            isAdministrator: role === "admin",
          },
  })

const post = (number: number, extra: Partial<Post> = {}): Post =>
  ({
    id: number * 10,
    number,
    slug: `idea-${number}`,
    title: `Idea ${number}`,
    description: "",
    createdAt: new Date().toISOString(),
    status: "open",
    user: { id: AUTHOR_ID, name: "Grace", avatarURL: "" },
    hasVoted: false,
    response: null,
    votesCount: 3,
    commentsCount: 0,
    tags: [],
    isApproved: true,
    isPrivate: false,
    ...extra,
  }) as unknown as Post

const ok = (data: unknown) => Promise.resolve({ ok: true, data })

const mockHttp = () => {
  http.get = jest.fn((url: string) => {
    const m = /^\/api\/v1\/posts\/(\d+)$/.exec(url)
    if (m) return ok(post(parseInt(m[1], 10)))
    if (/\/comments$/.test(url) || /\/votes$/.test(url) || url === "/api/v1/tags") return ok([])
    return Promise.resolve({ ok: false, data: {} })
  }) as unknown as typeof http.get
  http.put = jest.fn(() => ok({})) as unknown as typeof http.put
  http.post = jest.fn(() => ok({})) as unknown as typeof http.post
}

const renderIdea = (role: Role, p: Post = post(5)) =>
  render(
    <FiderContext.Provider value={fiderAs(role)}>
      <ShowPostPage post={p} subscribed={false} comments={[]} tags={[]} votes={[]} attachments={[]} />
    </FiderContext.Provider>
  )

const dialog = () => document.querySelector<HTMLElement>(".u2-dlg") as HTMLElement
const primaryIn = (el: Element) => el.querySelector<HTMLButtonElement>(".u2-btn--primary") as HTMLButtonElement

beforeEach(() => {
  window.scrollTo = jest.fn()
  window.history.replaceState({}, "", "/")
  mockHttp()
})

describe("idea permission rules (same as classic)", () => {
  test("edit: staff any time, the author for an hour, nobody else", () => {
    const fresh = post(1)
    const old = post(1, { createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString() })
    expect(canEditIdea(fiderAs("collaborator"), old)).toBe(true)
    expect(canEditIdea(fiderAs("author"), fresh)).toBe(true)
    expect(canEditIdea(fiderAs("author"), old)).toBe(false)
    expect(canEditIdea(fiderAs("member"), fresh)).toBe(false)
    expect(canEditIdea(fiderAs("visitor"), fresh)).toBe(false)
  })

  test("delete: administrators only, and only while the idea is not closed", () => {
    expect(canDeleteIdea(fiderAs("admin"), post(1))).toBe(true)
    expect(canDeleteIdea(fiderAs("admin"), post(1, { status: "completed" }))).toBe(false)
    expect(canDeleteIdea(fiderAs("collaborator"), post(1))).toBe(false)
    expect(canDeleteIdea(fiderAs("author"), post(1))).toBe(false)
  })

  test("privacy: staff either way; an author may only publish their own private idea when allowed", () => {
    const priv = post(1, { isPrivate: true })
    expect(canTogglePrivacy(fiderAs("collaborator"), post(1))).toBe(true)
    expect(canTogglePrivacy(fiderAs("collaborator"), priv)).toBe(true)
    expect(canTogglePrivacy(fiderAs("author", { membersCanPublishPrivate: true }), priv)).toBe(true)
    expect(canTogglePrivacy(fiderAs("author", { membersCanPublishPrivate: false }), priv)).toBe(false)
    expect(canTogglePrivacy(fiderAs("author", { membersCanPublishPrivate: true }), post(1))).toBe(false)
    expect(canTogglePrivacy(fiderAs("member", { membersCanPublishPrivate: true }), priv)).toBe(false)
  })

  test("merge hash", () => {
    expect(mergeTarget("#merge=412")).toBe(412)
    expect(mergeTarget("#merge")).toBeUndefined()
    expect(mergeTarget("#comment")).toBeNull()
    expect(mergeTarget("#merge=abc")).toBeNull()
  })
})

describe("ui2 idea page", () => {
  test("the status response sends status, text and no merge target", async () => {
    renderIdea("collaborator")
    fireEvent.click(document.querySelector(".u2-idea__tools .u2-btn") as HTMLElement)
    const dlg = dialog()
    fireEvent.change(dlg.querySelector("select[name=status]") as HTMLSelectElement, { target: { value: "planned" } })
    fireEvent.change(dlg.querySelector("textarea[name=text]") as HTMLTextAreaElement, { target: { value: "Coming in May" } })
    fireEvent.click(primaryIn(dlg.querySelector(".u2-dlg__foot") as HTMLElement))
    await waitFor(() => expect(http.put).toHaveBeenCalledWith("/api/v1/posts/5/status", { status: "planned", text: "Coming in May", originalNumber: 0 }))
  })

  test("#merge=N opens the merge dialog on Duplicate with #N chosen, and merges through the response API", async () => {
    window.history.replaceState({}, "", "/posts/5/idea-5#merge=7")
    renderIdea("collaborator")
    const dlg = dialog()
    expect(dlg).not.toBeNull()
    expect((dlg.querySelector("select[name=status]") as HTMLSelectElement).value).toBe("duplicate")
    await waitFor(() => expect(dlg.querySelector('[data-target="7"]')?.textContent).toContain("Idea 7"))
    fireEvent.click(primaryIn(dlg.querySelector(".u2-dlg__foot") as HTMLElement))
    await waitFor(() => expect(http.put).toHaveBeenCalledWith("/api/v1/posts/5/status", { status: "duplicate", text: "", originalNumber: 7 }))
    // Done: the hash is cleared so a reload does not reopen it.
    await waitFor(() => expect(location.hash).toBe(""))
  })

  test("#merge is ignored for members", async () => {
    window.history.replaceState({}, "", "/posts/5/idea-5#merge=7")
    renderIdea("member")
    await act(() => Promise.resolve())
    expect(dialog()).toBeNull()
  })

  const typeComment = async (text: string) => {
    const mode = await waitFor(() => {
      const b = document.querySelector<HTMLButtonElement>(".u2-compose .u2-md__mode")
      expect(b?.disabled).toBe(false)
      return b as HTMLButtonElement
    })
    fireEvent.click(mode)
    fireEvent.change(screen.getByTestId("u2-markdown-raw"), { target: { value: text } })
  }

  test("staff post a team-only comment through the comments action", async () => {
    renderIdea("collaborator")
    await typeComment("Started on this")
    fireEvent.click(document.querySelector(".u2-compose [role=switch]") as HTMLElement)
    fireEvent.click(primaryIn(document.querySelector(".u2-compose") as HTMLElement))
    await waitFor(() => expect(http.post).toHaveBeenCalledWith("/api/v1/posts/5/comments", { content: "Started on this", attachments: [], isInternal: true }))
  })

  test("the composer is locked while a comment posts, so nothing typed meanwhile is lost", async () => {
    let finish: (v: unknown) => void = () => undefined
    renderIdea("member")
    await typeComment("First thought")
    http.post = jest.fn(() => new Promise((r) => (finish = r))) as unknown as typeof http.post
    fireEvent.click(primaryIn(document.querySelector(".u2-compose") as HTMLElement))
    await waitFor(() => expect(http.post).toHaveBeenCalled())
    expect((screen.getByTestId("u2-markdown-raw") as HTMLTextAreaElement).disabled).toBe(true)
    await act(async () => finish({ ok: true, data: {} }))
  })

  test("members get no team-only switch and post public comments", async () => {
    renderIdea("member")
    await typeComment("Me too")
    expect(document.querySelector(".u2-compose [role=switch]")).toBeNull()
    fireEvent.click(primaryIn(document.querySelector(".u2-compose") as HTMLElement))
    await waitFor(() => expect(http.post).toHaveBeenCalledWith("/api/v1/posts/5/comments", { content: "Me too", attachments: [], isInternal: false }))
  })

  test("staff tools and edit/delete/privacy controls follow the role", async () => {
    const { unmount } = renderIdea("member")
    await act(() => Promise.resolve())
    expect(document.querySelector(".u2-idea__staff")).toBeNull()
    expect(document.querySelectorAll(".u2-idea__acts button")).toHaveLength(1) // copy link only
    unmount()
    renderIdea("admin")
    await act(() => Promise.resolve())
    expect(document.querySelector(".u2-idea__staff")).not.toBeNull()
    // copy link, edit, privacy, delete
    expect(document.querySelectorAll(".u2-idea__acts button")).toHaveLength(4)
  })
})

describe("ui2 board overlay", () => {
  const renderBoard = () =>
    render(
      <FiderContext.Provider value={fiderAs("collaborator")}>
        <HomePage posts={[post(1), post(2)]} tags={[]} searchNoiseWords={[]} countPerStatus={{ open: 2 }} />
      </FiderContext.Provider>
    )

  test("opening an idea pushes its URL; Esc returns to the board URL", async () => {
    window.history.replaceState({}, "", "/?view=recent")
    renderBoard()
    fireEvent.click(screen.getByText("Idea 2"))
    expect(location.pathname).toBe("/posts/2/idea-2")
    await waitFor(() => expect(document.querySelector(".u2-ovl [role=dialog] h1")?.textContent).toBe("Idea 2"))

    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(document.querySelector(".u2-ovl")).toBeNull())
    expect(location.pathname + location.search).toBe("/?view=recent")
  })

  test("Back (popstate to the board URL) closes the overlay", async () => {
    renderBoard()
    fireEvent.click(screen.getByText("Idea 1"))
    await waitFor(() => expect(document.querySelector(".u2-ovl")).not.toBeNull())
    act(() => {
      window.history.replaceState({ scrollY: 0 }, "", "/")
      window.dispatchEvent(new PopStateEvent("popstate", { state: { scrollY: 0 } }))
    })
    await waitFor(() => expect(document.querySelector(".u2-ovl")).toBeNull())
  })

  test("a modified click keeps the browser's default (new tab)", () => {
    renderBoard()
    fireEvent.click(screen.getByText("Idea 1"), { ctrlKey: true })
    expect(location.pathname).toBe("/")
    expect(document.querySelector(".u2-ovl")).toBeNull()
  })

  test("Vora's merge note opens the overlay with the merge dialog prefilled", async () => {
    http.get = jest.fn((url: string) => {
      if (url.startsWith("/_api/ui2/board-insights")) return ok({ notes: { "2": [{ kind: "duplicate", of: 1 }] } })
      const m = /^\/api\/v1\/posts\/(\d+)$/.exec(url)
      if (m) return ok(post(parseInt(m[1], 10)))
      if (/\/comments$/.test(url) || /\/votes$/.test(url) || url === "/api/v1/tags") return ok([])
      return Promise.resolve({ ok: false, data: {} })
    }) as unknown as typeof http.get
    renderBoard()
    const note = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-chip="duplicate"]')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    fireEvent.click(note)
    expect(location.pathname + location.hash).toBe("/posts/2/idea-2#merge=1")
    await waitFor(() => expect((dialog()?.querySelector("select[name=status]") as HTMLSelectElement)?.value).toBe("duplicate"))
  })
})
