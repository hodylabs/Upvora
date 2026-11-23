import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { Fider, FiderContext } from "@fider/services"
import { httpMock } from "@fider/services/testing"
import { UserAvatarType } from "@fider/models"
import { Shell } from "./Shell"
import { resetTeamViewCache, TEAM_VIEW_KEY } from "../lib/teamView"

// Trans renders empty under jest (@lingui/react is mocked), so these assert roles, hrefs and keys.

type Role = "out" | "visitor" | "collaborator" | "administrator"

const products = [
  { id: 1, name: "termynl", slug: "termynl", description: "", color: "#fd8d27", sortOrder: 1, isActive: true },
  { id: 2, name: "Old", slug: "old", description: "", color: "", sortOrder: 2, isActive: false },
]

const fider = (role: Role, page = "Roadmap/Roadmap.page") =>
  Fider.initialize({
    page,
    settings: { environment: "production", oauth: [], baseURL: "http://demo.test", version: "1.0" },
    tenant: { name: "Demo", products, isScorecardEnabled: true },
    user:
      role === "out"
        ? undefined
        : {
            name: "Ada",
            avatarURL: "/a.png",
            avatarType: UserAvatarType.Letter,
            isCollaborator: role !== "visitor",
            isAdministrator: role === "administrator",
          },
  })

const renderShell = (role: Role, page?: string) =>
  render(
    <FiderContext.Provider value={fider(role, page)}>
      <Shell>
        <p>page</p>
      </Shell>
    </FiderContext.Provider>
  )

const accountKeys = () => {
  fireEvent.click(screen.getByRole("button", { name: "Ada" }))
  return screen.getAllByRole("menuitem").map((el) => el.getAttribute("data-key"))
}

beforeEach(() => {
  httpMock.alwaysOk()
  localStorage.clear()
  resetTeamViewCache()
  document.body.className = ""
})

describe("ui2 <Shell /> top bar", () => {
  test("no sidebar; tabs, product switcher with active products only", () => {
    const { container } = renderShell("visitor")
    expect(container.querySelector(".u2-side")).toBeNull()
    const tabs = Array.from(container.querySelectorAll(".u2-tabs a")).map((a) => a.getAttribute("href"))
    expect(tabs).toEqual(["/", "/roadmap"])
    fireEvent.click(container.querySelector(".u2-pswitch__btn") as HTMLElement)
    const hrefs = screen.getAllByRole("menuitem").map((a) => a.getAttribute("href"))
    expect(hrefs).toEqual(["/", "/p/termynl"])
  })

  test("signed out: Sign in, no team switch, no account menu", () => {
    const { container } = renderShell("out")
    expect(container.querySelector('a[href^="/signin?redirect="]')).not.toBeNull()
    expect(screen.queryByRole("switch")).toBeNull()
    expect(screen.queryByRole("button", { name: "Ada" })).toBeNull()
    expect(container.querySelector(".u2-bell")).toBeNull()
  })

  test("account menu items by role", () => {
    renderShell("visitor")
    expect(accountKeys()).toEqual(["myvotes", "myposts", "notifications", "settings", "signout"])
  })

  test("staff see Site settings and the Scorecard tab", () => {
    const { container } = renderShell("collaborator")
    expect(accountKeys()).toEqual(["myvotes", "myposts", "notifications", "settings", "admin", "signout"])
    expect(container.querySelector('.u2-tabs a[href="/scorecard"]')).not.toBeNull()
  })

  test("team view: staff only, toggles, persists and sets the body class", () => {
    const visitor = renderShell("visitor")
    expect(screen.queryByRole("switch")).toBeNull()
    visitor.unmount()

    const staff = renderShell("administrator")
    const sw = screen.getByRole("switch")
    expect(sw.getAttribute("aria-checked")).toBe("false")
    act(() => {
      fireEvent.click(sw)
    })
    expect(sw.getAttribute("aria-checked")).toBe("true")
    expect(localStorage.getItem(TEAM_VIEW_KEY)).toBe("1")
    expect(document.body.classList.contains("u2-team")).toBe(true)
    staff.unmount()

    // A fresh page load reads it back from storage.
    resetTeamViewCache()
    renderShell("administrator")
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true")
  })

  test("a stored 'on' does nothing for non-staff", () => {
    localStorage.setItem(TEAM_VIEW_KEY, "1")
    renderShell("visitor")
    expect(document.body.classList.contains("u2-team")).toBe(false)
  })

  test("New idea shows everywhere except the board", () => {
    const { container, unmount } = renderShell("visitor")
    expect(container.querySelector(".u2-top__new")).not.toBeNull()
    unmount()
    const home = renderShell("visitor", "Home/Home.page")
    expect(home.container.querySelector(".u2-top__new")).toBeNull()
  })
})
