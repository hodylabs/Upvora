import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import { httpMock } from "@fider/services/testing"
import { Notification, UserAvatarType } from "@fider/models"
import MyNotificationsPage, { splitByRead } from "./MyNotifications/MyNotifications.page"
import MySettingsPage, { isOn, toggleChannel, WEB, EMAIL } from "./MySettings/MySettings.page"
import SignInPage, { redirectTarget } from "./SignIn/SignIn.page"
import { NotificationsBadge, NOTIFICATIONS_READ_EVENT } from "../components/NotificationsBadge"
import { isSafeRedirect } from "./OAuthConsent/OAuthConsent.page"
import { roleCheckPasses } from "./OAuthEcho/OAuthEcho.page"

// Trans renders empty under jest (@lingui/react is mocked), so these assert calls and structure.

const signedIn = () =>
  Fider.initialize({
    page: "MySettings/MySettings.page",
    settings: { environment: "development", oauth: [], baseURL: "http://demo.test" },
    tenant: { name: "Demo", isEmailAuthAllowed: true },
    user: { name: "Ada", email: "ada@demo.test", avatarType: UserAvatarType.Letter, isCollaborator: false },
  })

const signedOut = () =>
  Fider.initialize({
    page: "SignIn/SignIn.page",
    settings: { environment: "development", oauth: [], baseURL: "http://demo.test", hasLegal: false },
    tenant: { name: "Demo", isEmailAuthAllowed: true, isPrivate: false, status: 1 },
    user: undefined,
  })

const withFider = (fider: ReturnType<typeof signedIn>, el: React.ReactElement) => render(<FiderContext.Provider value={fider}>{el}</FiderContext.Provider>)

const note = (id: number, read: boolean): Notification => ({
  id,
  read,
  title: `**Note ${id}**`,
  link: "/posts/1",
  createdAt: "2026-11-19T10:00:00Z",
  authorName: "Bo",
  avatarURL: "",
})

describe("ui2 MyNotifications", () => {
  test("splits unread from read", () => {
    const { unread, read } = splitByRead([note(1, false), note(2, true), note(3, false)])
    expect(unread.map((n) => n.id)).toEqual([1, 3])
    expect(read.map((n) => n.id)).toEqual([2])
  })

  test("mark all as read posts once, moves the items and tells the badge", async () => {
    const mock = httpMock.alwaysOk()
    const heard = jest.fn()
    window.addEventListener(NOTIFICATIONS_READ_EVENT, heard)
    const { container } = withFider(signedIn(), <MyNotificationsPage notifications={[note(1, false), note(2, true)]} />)
    expect(container.querySelectorAll(".u2-nlist__item--unread")).toHaveLength(1)
    expect(container.querySelector('a[href="/notifications/1"]')).not.toBeNull()

    const markAll = container.querySelector(".u2-nlist__head .u2-btn") as HTMLButtonElement
    await act(async () => fireEvent.click(markAll))
    expect(mock.post).toHaveBeenCalledWith("/_api/notifications/read-all")
    expect(container.querySelectorAll(".u2-nlist__item--unread")).toHaveLength(0)
    expect(container.querySelectorAll(".u2-nlist__item")).toHaveLength(2)
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener(NOTIFICATIONS_READ_EVENT, heard)
  })
})

describe("ui2 NotificationsBadge", () => {
  test("shows the unread total and clears on the read event", async () => {
    httpMock.alwaysOk()
    http.get = jest.fn(() => Promise.resolve({ ok: true, data: { total: 3 } })) as unknown as typeof http.get
    const { container } = withFider(signedIn(), <NotificationsBadge />)
    expect(http.get).toHaveBeenCalledWith("/_api/notifications/unread/total")
    await waitFor(() => expect(container.querySelector(".u2-bell__n")?.textContent).toBe("3"))
    act(() => {
      window.dispatchEvent(new CustomEvent(NOTIFICATIONS_READ_EVENT))
    })
    expect(container.querySelector(".u2-bell__n")).toBeNull()
  })

  test("renders nothing for visitors", () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(signedOut(), <NotificationsBadge />)
    expect(container.innerHTML).toBe("")
    expect(mock.get).not.toHaveBeenCalled()
  })
})

describe("ui2 MySettings", () => {
  test("channel bits flip independently", () => {
    let s = toggleChannel({ ev: "3" }, "ev", WEB)
    expect(s.ev).toBe("2")
    expect(isOn(s, "ev", WEB)).toBe(false)
    expect(isOn(s, "ev", EMAIL)).toBe(true)
    s = toggleChannel({}, "new", EMAIL)
    expect(s.new).toBe("2")
  })

  test("save sends name, avatar type and the toggled notification settings", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(
      signedIn(),
      <MySettingsPage
        userSettings={{
          event_notification_new_post: "3",
          event_notification_new_comment: "1",
          event_notification_mention: "3",
          event_notification_change_status: "2",
        }}
      />
    )
    const name = container.querySelector('input[name="name"]') as HTMLInputElement
    fireEvent.change(name, { target: { value: "Ada L." } })
    // first switch: New Post on the web channel
    fireEvent.click(screen.getAllByRole("switch")[0])
    await act(async () => fireEvent.submit(name.closest("form") as HTMLFormElement))
    expect(mock.post).toHaveBeenCalledWith("/_api/user/settings", {
      name: "Ada L.",
      avatarType: "letter",
      avatar: undefined,
      settings: {
        event_notification_new_post: "2",
        event_notification_new_comment: "1",
        event_notification_mention: "3",
        event_notification_change_status: "2",
      },
    })
  })

  test("API key section only for staff", () => {
    httpMock.alwaysOk()
    const { container } = withFider(signedIn(), <MySettingsPage userSettings={{}} />)
    expect(container.querySelector("#u2-set-api")).toBeNull()
  })
})

describe("ui2 SignIn", () => {
  test("only same-site redirects are followed", () => {
    expect(redirectTarget("http://demo.test", "?redirect=/posts/1")).toBe("http://demo.test/posts/1")
    expect(redirectTarget("http://demo.test", "?redirect=https://evil.test")).toBe("http://demo.test")
    expect(redirectTarget("http://demo.test", "?redirect=//evil.test")).toBe("http://demo.test")
    expect(redirectTarget("http://demo.test", "")).toBe("http://demo.test")
  })

  test("email then code: posts the email, then verifies the code", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(signedOut(), <SignInPage />)
    const email = container.querySelector('input[name="email"]') as HTMLInputElement
    fireEvent.change(email, { target: { value: "ada@demo.test" } })
    await act(async () => fireEvent.submit(email.closest("form") as HTMLFormElement))
    expect(mock.post).toHaveBeenCalledWith("/_api/signin", { email: "ada@demo.test" })

    // an existing account goes straight to the code step
    const code = container.querySelector('input[name="code"]') as HTMLInputElement
    expect(code).not.toBeNull()
    fireEvent.change(code, { target: { value: "123456" } })
    await act(async () => fireEvent.submit(code.closest("form") as HTMLFormElement))
    expect(mock.post).toHaveBeenCalledWith("/_api/signin/verify", { email: "ada@demo.test", code: "123456" })
  })
})

describe("ui2 OAuth helpers", () => {
  test("consent only follows safe redirects", () => {
    expect(isSafeRedirect("https://client.test/cb?code=1")).toBe(true)
    expect(isSafeRedirect("http://127.0.0.1:3000/cb")).toBe(true)
    expect(isSafeRedirect("javascript:alert(1)")).toBe(false)
    expect(isSafeRedirect("data:text/html,x")).toBe(false)
    expect(isSafeRedirect("not a url")).toBe(false)
  })

  test("role check passes on any allowed role, or when none are listed", () => {
    expect(roleCheckPasses("admin, staff", ["staff"])).toBe(true)
    expect(roleCheckPasses("admin", ["user"])).toBe(false)
    expect(roleCheckPasses(" , ", [])).toBe(true)
  })
})
