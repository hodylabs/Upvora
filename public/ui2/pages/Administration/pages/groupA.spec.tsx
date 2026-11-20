import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import { httpMock, setupModalRoot } from "@fider/services/testing"
import { User, UserRole, UserStatus } from "@fider/models"
import { toast } from "../../../components/feedback"
import DangerZonePage from "./DangerZone.page"
import { createPrivacySaver, PrivacyState } from "./PrivacySettings.page"
import { levelOf, planLevel, usersURL } from "./ManageMembers.page"
import { parseRecipients } from "./Invitations.page"

// Trans renders empty under jest (@lingui/react is mocked), so these assert calls and structure.

const admin = () =>
  Fider.initialize({
    page: "Administration/pages/DangerZone.page",
    settings: { environment: "development", oauth: [], baseURL: "http://demo.test", version: "1.0.0" },
    tenant: { name: "Demo", subdomain: "demo" },
    user: { id: 1, name: "Ada", email: "ada@demo.test", isAdministrator: true, isCollaborator: true, role: "administrator" },
  })

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  setupModalRoot()
  httpMock.alwaysOk()
  jest.spyOn(toast, "success").mockReturnValue(0)
  jest.spyOn(toast, "error").mockReturnValue(0)
})

describe("ui2 DangerZone", () => {
  const renderPage = (isOwner = true) => {
    const fider = admin()
    const del = jest.fn(() => Promise.resolve({ ok: true, data: { scheduledDeletionAt: "2026-11-20T13:00:00Z" } }))
    http.delete = del as unknown as typeof http.delete
    const view = render(
      <FiderContext.Provider value={fider}>
        <DangerZonePage isOwner={isOwner} scheduledDeletionAt={null} />
      </FiderContext.Provider>
    )
    return { del, view }
  }

  test("delete goes out only after the typed subdomain and the confirm", async () => {
    const { del, view } = renderPage()
    fireEvent.click(view.container.querySelector(".u2-btn--danger") as HTMLButtonElement)
    const confirm = screen.getByTestId("u2-danger-confirm") as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    const input = document.querySelector('#root-modal input[name="confirmation"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: "dem" } })
    expect(confirm.disabled).toBe(true)
    fireEvent.click(confirm)
    // Enter in the field submits the form, which must also refuse a wrong value.
    fireEvent.submit(input.form as HTMLFormElement)
    expect(del).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: "demo" } })
    expect(confirm.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(confirm)
      await flush()
    })
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith("/_api/admin/tenant", { subdomain: "demo" })
    expect(screen.queryByTestId("u2-danger-confirm")).toBeNull()
  })

  test("cancel closes the dialog and sends nothing", () => {
    const { del, view } = renderPage()
    fireEvent.click(view.container.querySelector(".u2-btn--danger") as HTMLButtonElement)
    const input = document.querySelector('#root-modal input[name="confirmation"]') as HTMLInputElement
    fireEvent.change(input, { target: { value: "demo" } })
    fireEvent.click(document.querySelector("#root-modal .u2-btn--ghost") as HTMLButtonElement)
    expect(screen.queryByTestId("u2-danger-confirm")).toBeNull()
    expect(del).not.toHaveBeenCalled()
  })

  test("a non-owner gets no delete button", () => {
    const { view } = renderPage(false)
    expect(view.container.querySelector(".u2-btn--danger")).toBeNull()
  })
})

describe("ui2 Privacy saves", () => {
  const base: PrivacyState = {
    isPrivate: false,
    isFeedEnabled: true,
    isModerationEnabled: false,
    membersPrivateIdeas: false,
    membersCanPublishPrivate: false,
    isSignUpDisabled: false,
  }

  const queuePosts = () => {
    const pending: { resolve: (ok: boolean) => void; body: PrivacyState }[] = []
    http.post = jest.fn(
      (_url: string, body: PrivacyState) =>
        new Promise((resolve) => {
          pending.push({ body, resolve: (ok) => resolve({ ok, data: null }) })
        })
    ) as unknown as typeof http.post
    return pending
  }

  test("going private turns the feed off in the same save", async () => {
    const pending = queuePosts()
    let shown = base
    const saver = createPrivacySaver(base, (s) => (shown = s), jest.fn())
    saver.update({ isPrivate: true })
    await flush()
    expect(shown.isFeedEnabled).toBe(false)
    expect(pending[0].body).toEqual({ ...base, isPrivate: true, isFeedEnabled: false })
  })

  test("a failed save rolls back to the last accepted settings", async () => {
    const pending = queuePosts()
    let shown = base
    const saver = createPrivacySaver(base, (s) => (shown = s), jest.fn())
    saver.update({ membersPrivateIdeas: true })
    await flush()
    pending[0].resolve(false)
    await flush()
    expect(shown.membersPrivateIdeas).toBe(false)
  })

  test("a failed older save does not undo a newer successful one", async () => {
    const pending = queuePosts()
    let shown = base
    const saved = jest.fn()
    const saver = createPrivacySaver(base, (s) => (shown = s), saved)
    saver.update({ membersPrivateIdeas: true })
    saver.update({ isModerationEnabled: true })
    await flush()
    pending[0].resolve(false)
    await flush()
    pending[1].resolve(true)
    await flush()
    expect(shown.membersPrivateIdeas).toBe(true)
    expect(shown.isModerationEnabled).toBe(true)
    expect(saved).toHaveBeenCalledTimes(1)
  })

  test("a network error rolls back and later saves still run", async () => {
    let calls = 0
    http.post = jest.fn(() => (++calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ ok: true, data: null }))) as unknown as typeof http.post
    let shown = base
    const saver = createPrivacySaver(base, (s) => (shown = s), jest.fn())
    await saver.update({ membersPrivateIdeas: true })
    expect(shown.membersPrivateIdeas).toBe(false)
    await saver.update({ isModerationEnabled: true })
    expect(calls).toBe(2)
    expect(shown.isModerationEnabled).toBe(true)
  })
})

describe("ui2 Members levels", () => {
  const user = (over: Partial<User>): User => ({ id: 7, name: "Bo", role: UserRole.Visitor, status: UserStatus.Active, isTrusted: false, ...over }) as User

  test("levelOf reads blocked first, then role, then trust", () => {
    expect(levelOf(user({ status: UserStatus.Blocked, role: UserRole.Administrator }))).toBe("blocked")
    expect(levelOf(user({ role: UserRole.Collaborator }))).toBe("collaborator")
    expect(levelOf(user({ isTrusted: true }))).toBe("trusted")
    expect(levelOf(user({}))).toBe("member")
  })

  test("blocking an admin demotes then blocks, and keeps trust as it was", async () => {
    httpMock.alwaysOk()
    const plan = planLevel(user({ role: UserRole.Administrator, isTrusted: true }), "blocked")
    expect(plan).toMatchObject({ role: UserRole.Visitor, status: UserStatus.Blocked, isTrusted: true })
    expect(plan.steps).toHaveLength(2)
    for (const s of plan.steps) await s()
    expect(http.post).toHaveBeenCalledWith("/_api/admin/roles/visitor/users", { userID: 7 })
    expect(http.put).toHaveBeenCalledWith("/_api/admin/users/7/block")
  })

  test("member to trusted is one trust call; same level is no call", () => {
    expect(planLevel(user({}), "trusted").steps).toHaveLength(1)
    expect(planLevel(user({}), "member").steps).toHaveLength(0)
  })

  test("the search URL carries query, level and page", () => {
    expect(usersURL("ada", "blocked", 2)).toBe("/api/v1/users?query=ada&roles=blocked&page=2&limit=10")
    expect(usersURL("", "all", 1)).toBe("/api/v1/users?page=1&limit=10")
  })
})

describe("ui2 Invitations", () => {
  test("recipients split on semicolons, commas, spaces and lines", () => {
    expect(parseRecipients("a@x.io; b@x.io,c@x.io\nd@x.io  e@x.io")).toEqual(["a@x.io", "b@x.io", "c@x.io", "d@x.io", "e@x.io"])
    expect(parseRecipients("  ")).toEqual([])
  })
})
