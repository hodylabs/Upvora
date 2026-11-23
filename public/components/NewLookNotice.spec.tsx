import React from "react"
import { render } from "@testing-library/react"
import { Fider, FiderContext } from "@fider/services"
import { NewLookNotice } from "@fider/components"

const mount = (user: unknown, ui: "classic" | "new") => {
  const fider = Fider.initialize({ settings: { environment: "development", oauth: [] }, tenant: { ui }, user })
  return render(
    <FiderContext.Provider value={fider}>
      <NewLookNotice />
    </FiderContext.Provider>
  )
}

describe("<NewLookNotice />", () => {
  beforeEach(() => window.localStorage.clear())

  test("administrators on classic see the switch", () => {
    const { container } = mount({ name: "A", role: "administrator", isAdministrator: true, isCollaborator: true }, "classic")
    expect(container.querySelector(".c-newlook__go")).not.toBeNull()
  })

  test("hidden for collaborators, visitors and sites already on the new look", () => {
    expect(mount({ name: "C", role: "collaborator", isAdministrator: false, isCollaborator: true }, "classic").container.querySelector(".c-newlook")).toBeNull()
    expect(mount(undefined, "classic").container.querySelector(".c-newlook")).toBeNull()
    expect(mount({ name: "A", role: "administrator", isAdministrator: true, isCollaborator: true }, "new").container.querySelector(".c-newlook")).toBeNull()
  })
})
