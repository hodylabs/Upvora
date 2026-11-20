import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import { Fider, FiderContext } from "@fider/services"
import { httpMock } from "@fider/services/testing"
import { NotYet } from "./NotYet"

// Trans renders empty under jest (@lingui/react is mocked), so assert structure.
const fiderAs = (user?: { isAdministrator: boolean }) =>
  Fider.initialize({
    page: "Home/Home.page",
    settings: { environment: "development", oauth: [] },
    tenant: {},
    user: user ? { name: "Ada", ...user } : undefined,
  })

const renderWith = (fider: ReturnType<typeof fiderAs>) =>
  render(
    <FiderContext.Provider value={fider}>
      <NotYet />
    </FiderContext.Provider>
  )

describe("ui2 <NotYet />", () => {
  test("visitors see the page name but no switch", () => {
    renderWith(fiderAs())
    expect(screen.getByText("Home/Home.page")).toBeDefined()
    expect(screen.queryByRole("button")).toBeNull()
  })

  test("non-admins get no switch", () => {
    renderWith(fiderAs({ isAdministrator: false }))
    expect(screen.queryByRole("button")).toBeNull()
  })

  test("administrators can switch the site back to classic", async () => {
    const http = httpMock.alwaysOk()
    renderWith(fiderAs({ isAdministrator: true }))
    fireEvent.click(screen.getByRole("button"))
    expect(http.post).toHaveBeenCalledWith("/_api/admin/settings/look", { ui: "classic" })
  })
})
