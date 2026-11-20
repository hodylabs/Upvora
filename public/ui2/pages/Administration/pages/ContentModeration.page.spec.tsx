import React from "react"
import { render, waitFor, fireEvent } from "@testing-library/react"
import { Fider, FiderContext, http, notify } from "@fider/services"
import ContentModerationPage, { ModerationItem } from "./ContentModeration.page"
import { ModerationBadge } from "../../../components/ModerationBadge"

const user = { id: 3, name: "Sam", email: "sam@example.com", avatarURL: "", role: "visitor", status: "active" }
const items: ModerationItem[] = [
  {
    type: "post",
    id: 11,
    postNumber: 5,
    postSlug: "dark-mode",
    title: "Dark mode",
    content: "Please **add** it",
    user,
    createdAt: "2026-11-19T00:00:00Z",
  } as never,
  {
    type: "comment",
    id: 22,
    postNumber: 5,
    postSlug: "dark-mode",
    postTitle: "Dark mode",
    content: "Me too",
    user,
    createdAt: "2026-11-19T00:00:00Z",
  } as never,
]

const fider = (tenant: object = {}) =>
  Fider.initialize({
    settings: { environment: "development", oauth: [], locale: "en" },
    tenant: { isPro: true, isModerationEnabled: true, ...tenant },
    user: { name: "Ada", isCollaborator: true, isAdministrator: true },
  })

const renderPage = () =>
  render(
    <FiderContext.Provider value={fider()}>
      <ContentModerationPage />
    </FiderContext.Provider>
  )

const ids = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>(".u2-mod__item")).map((i) => `${i.dataset.kind}-${i.dataset.id}`)
const act = (c: HTMLElement, key: string, verb: string) => {
  const [kind, id] = key.split("-")
  fireEvent.click(c.querySelector(`.u2-mod__item[data-kind="${kind}"][data-id="${id}"] [data-verb="${verb}"]`) as HTMLElement)
}

describe("ui2 Content moderation", () => {
  let post: jest.Mock
  let success: jest.SpyInstance
  let error: jest.SpyInstance

  beforeEach(() => {
    http.get = jest.fn(() => Promise.resolve({ ok: true, data: { items } })) as unknown as typeof http.get
    post = jest.fn(() => Promise.resolve({ ok: true, data: {} }))
    http.post = post as unknown as typeof http.post
    success = jest.spyOn(notify, "success").mockResolvedValue(undefined)
    error = jest.spyOn(notify, "error").mockResolvedValue(undefined)
  })
  afterEach(() => {
    success.mockRestore()
    error.mockRestore()
  })

  test("loads the queue, with the idea link and the comment anchor", async () => {
    const { container } = renderPage()
    await waitFor(() => expect(ids(container)).toEqual(["post-11", "comment-22"]))
    expect(http.get).toHaveBeenCalledWith("/_api/admin/moderation/items")
    const links = Array.from(container.querySelectorAll<HTMLAnchorElement>(".u2-mod__link")).map((a) => a.getAttribute("href"))
    expect(links).toEqual(["/posts/5/dark-mode", "/posts/5/dark-mode#comment-22"])
  })

  test.each([
    ["post-11", "approve", "/api/v1/admin/moderation/posts/11/approve"],
    ["post-11", "decline", "/api/v1/admin/moderation/posts/11/decline"],
    ["post-11", "approveVerify", "/api/v1/admin/moderation/posts/11/approve-and-verify"],
    ["post-11", "declineBlock", "/api/v1/admin/moderation/posts/11/decline-and-block"],
    ["comment-22", "approve", "/api/v1/admin/moderation/comments/22/approve"],
    ["comment-22", "decline", "/api/v1/admin/moderation/comments/22/decline"],
    ["comment-22", "approveVerify", "/api/v1/admin/moderation/comments/22/approve-and-verify"],
    ["comment-22", "declineBlock", "/api/v1/admin/moderation/comments/22/decline-and-block"],
  ])("%s %s calls %s and leaves the queue", async (key, verb, url) => {
    const { container } = renderPage()
    await waitFor(() => expect(ids(container)).toHaveLength(2))
    act(container, key, verb)
    await waitFor(() => expect(ids(container)).not.toContain(key))
    expect(post).toHaveBeenCalledWith(url)
    expect(success).toHaveBeenCalled()
  })

  test("a refused action keeps the item and says so", async () => {
    post.mockImplementation(() => Promise.resolve({ ok: false, data: {} }))
    const { container } = renderPage()
    await waitFor(() => expect(ids(container)).toHaveLength(2))
    act(container, "post-11", "approve")
    await waitFor(() => expect(error).toHaveBeenCalled())
    expect(ids(container)).toEqual(["post-11", "comment-22"])
  })
})

describe("ui2 ModerationBadge", () => {
  test("shows the pending count to staff on a paid site with moderation on", async () => {
    http.get = jest.fn(() => Promise.resolve({ ok: true, data: { count: 4 } })) as unknown as typeof http.get
    const { container } = render(
      <FiderContext.Provider value={fider()}>
        <ModerationBadge />
      </FiderContext.Provider>
    )
    await waitFor(() => expect(container.querySelector(".u2-modbadge__n")?.textContent).toBe("4"))
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/admin/moderation")
    expect(http.get).toHaveBeenCalledWith("/_api/admin/moderation/count")
  })

  test("asks nothing on a site without the paid plan", () => {
    http.get = jest.fn() as unknown as typeof http.get
    const { container } = render(
      <FiderContext.Provider value={fider({ isPro: false })}>
        <ModerationBadge />
      </FiderContext.Provider>
    )
    expect(http.get).not.toHaveBeenCalled()
    expect(container.innerHTML).toBe("")
  })
})
