import React from "react"
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import { Post } from "@fider/models"
import ShowPostPage from "./ShowPost.page"
import HomePage from "../Home/Home.page"
import { canDeleteIdea, canEditIdea, canTogglePrivacy, mergeTarget } from "./rules"
import { setTeamView } from "../../lib/teamView"

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
    fireEvent.click(document.querySelector('[data-prop="status"]') as HTMLElement)
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

  const openTools = () => {
    const trigger = document.querySelector<HTMLElement>(".u2-idea__tools > button")
    if (!trigger) return []
    fireEvent.click(trigger)
    return Array.from(document.querySelectorAll<HTMLElement>(".u2-idea__tools [role=menuitem]")).map((el) => el.dataset.key)
  }

  test("no right rail: the former rail tools live in the top bar menu and follow the role", async () => {
    const { unmount } = renderIdea("member")
    await act(() => Promise.resolve())
    expect(document.querySelector("aside")).toBeNull()
    expect(document.querySelector(".u2-note-int")).toBeNull()
    expect(document.querySelector('button[data-prop="status"]')).toBeNull() // read-only status pill
    expect(openTools()).toEqual([])
    unmount()
    renderIdea("admin")
    await act(() => Promise.resolve())
    expect(document.querySelector(".u2-note-int")).not.toBeNull()
    expect(openTools()).toEqual(["edit", "respond", "merge", "privacy", "delete"])
  })

  test("the top bar has the number, copy link and a follow toggle", async () => {
    http.post = jest.fn(() => ok({})) as unknown as typeof http.post
    renderIdea("member")
    const top = document.querySelector(".u2-idea__top") as HTMLElement
    expect(top.textContent).toContain("#5")
    expect(top.querySelector('[data-act="copy"]')).not.toBeNull()
    const follow = top.querySelector(".u2-idea__follow") as HTMLButtonElement
    expect(follow.getAttribute("aria-pressed")).toBe("false")
    fireEvent.click(follow)
    await waitFor(() => expect(follow.getAttribute("aria-pressed")).toBe("true"))
  })

  test("property pills: vote, status, tags, voters and author", async () => {
    render(
      <FiderContext.Provider value={fiderAs("collaborator")}>
        <ShowPostPage
          post={post(5, { status: "planned", tags: ["ux"], votesCount: 2 })}
          subscribed={false}
          comments={[]}
          tags={[{ id: 1, slug: "ux", name: "UX", color: "ff0000", isPublic: true }]}
          votes={[{ createdAt: new Date(), user: { id: 3, name: "Lin", email: "", avatarURL: "/a.png" } }]}
          attachments={[]}
        />
      </FiderContext.Provider>
    )
    const props = document.querySelector(".u2-idea__props") as HTMLElement
    expect(props.querySelector(".u2-vote--large")).not.toBeNull()
    expect(props.querySelector('[data-prop="status"] [data-status="planned"]')).not.toBeNull()
    expect(props.querySelector('[data-prop="tag"]')?.textContent).toBe("UX")
    expect(props.querySelector('[data-prop="author"]')?.textContent).toContain("Grace")
    const voters = props.querySelector('button[data-prop="voters"]') as HTMLElement
    expect(voters.querySelectorAll(".u2-faces img")).toHaveLength(1)
    fireEvent.click(voters)
    expect(dialog()).not.toBeNull()
    // Staff edit tags from the pills.
    fireEvent.click(props.querySelector('[data-prop="tags"]') as HTMLElement)
    expect(document.querySelector(".u2-idea__tagpick")).not.toBeNull()
  })

  test("the activity timeline orders the shared event, the status change and comments by time", async () => {
    const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 0, min)).toISOString()
    const p = post(5, {
      createdAt: t(0),
      status: "planned",
      prevStatus: "open",
      statusChangedAt: t(20),
      response: { user: { id: 1, name: "Team Lead" }, text: "Spring release", respondedAt: t(20) as unknown as Date },
    } as Partial<Post>)
    const comments = [
      { id: 1, content: "Me too", createdAt: t(10), user: { id: 4, name: "Maya", role: "visitor" }, isApproved: true, isInternal: false },
      { id: 2, content: "Ship it", createdAt: t(30), user: { id: 5, name: "Kai", role: "collaborator" }, isApproved: true, isInternal: true },
    ]
    render(
      <FiderContext.Provider value={fiderAs("collaborator")}>
        <ShowPostPage post={p} subscribed={false} comments={comments as never} tags={[]} votes={[]} attachments={[]} />
      </FiderContext.Provider>
    )
    const items = Array.from(document.querySelectorAll<HTMLElement>(".u2-tl > li"))
    expect(items.map((li) => li.dataset.event || li.id)).toEqual(["shared", "comment-1", "status", "comment-2"])
    // (Lingui is mocked in tests, so event sentences render empty; the response text is Markdown.)
    expect(items[2].querySelector(".u2-ev__bubble")?.textContent).toContain("Spring release")
    expect(items[1].querySelector(".u2-cm__body")?.textContent).toContain("Me too")
    expect(items[3].classList.contains("is-internal")).toBe(true)
    expect(items[3].classList.contains("is-team")).toBe(true)
  })

  test("a merged idea shows a merge event linking the original", async () => {
    const p = post(5, {
      status: "duplicate",
      response: {
        user: { id: 1, name: "Team Lead" },
        text: "",
        respondedAt: new Date(),
        original: { number: 7, title: "Idea 7", slug: "idea-7", status: "open" },
      },
    } as Partial<Post>)
    render(
      <FiderContext.Provider value={fiderAs("member")}>
        <ShowPostPage post={p} subscribed={false} comments={[]} tags={[]} votes={[]} attachments={[]} />
      </FiderContext.Provider>
    )
    const ev = document.querySelector('[data-event="status"]') as HTMLElement
    expect(ev.querySelector(".u2-ev__bubble")).toBeNull()
    expect(ev.querySelector("a")?.getAttribute("href")).toBe("/posts/7/idea-7")
  })

  test("an open idea with no response has only the shared event", async () => {
    renderIdea("visitor")
    await act(() => Promise.resolve())
    expect(Array.from(document.querySelectorAll<HTMLElement>(".u2-tl > li")).map((li) => li.dataset.event)).toEqual(["shared"])
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
    expect(document.querySelector(".u2-ovl .u2-sheet")).not.toBeNull()

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
    // Vora's notes show to staff in Team view.
    setTeamView(true)
    renderBoard()
    const note = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-chip="duplicate"]')
      expect(el).not.toBeNull()
      return el as HTMLElement
    })
    fireEvent.click(note)
    expect(location.pathname + location.hash).toBe("/posts/2/idea-2#merge=1")
    await waitFor(() => expect((dialog()?.querySelector("select[name=status]") as HTMLSelectElement)?.value).toBe("duplicate"))
    setTeamView(false)
  })
})
