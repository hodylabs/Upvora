import React from "react"
import { act, fireEvent, render, waitFor } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import { httpMock, setupModalRoot } from "@fider/services/testing"
import { adminNavItems } from "./nav"
import { AdminLayout } from "./AdminLayout"
import GeneralSettingsPage, { LookPicker } from "./pages/GeneralSettings.page"
import AdvancedSettingsPage from "./pages/AdvancedSettings.page"

// Trans renders empty under jest (@lingui/react is mocked), so these assert calls and structure.

interface Opts {
  role?: "administrator" | "collaborator"
  billing?: boolean
  single?: boolean
  pro?: boolean
  moderation?: boolean
  ui?: string
}

const staff = (o: Opts = {}) => {
  const admin = (o.role || "administrator") === "administrator"
  return Fider.initialize({
    page: "Administration/pages/GeneralSettings.page",
    settings: {
      environment: "development",
      oauth: [],
      baseURL: "http://demo.test",
      domain: ".test.upvora",
      isBillingEnabled: !!o.billing,
      mode: o.single ? "single" : "multi",
      version: "1.0.0",
    },
    tenant: {
      name: "Acme",
      subdomain: "acme",
      cname: "",
      welcomeMessage: "Hi",
      welcomeHeader: "Head",
      descriptionTemplate: "",
      invitation: "Say",
      locale: "en",
      ui: o.ui || "new",
      isPro: !!o.pro,
      isModerationEnabled: !!o.moderation,
      fileAttachmentsEnabled: false,
    },
    user: { name: "Ada", isAdministrator: admin, isCollaborator: true, role: o.role || "administrator" },
  })
}

const withFider = (fider: ReturnType<typeof staff>, el: React.ReactElement) => render(<FiderContext.Provider value={fider}>{el}</FiderContext.Provider>)

const names = (o: Opts) => adminNavItems(staff(o)).map((i) => i.name)

describe("ui2 admin nav gating", () => {
  test("administrators get classic's full menu, grouped by section", () => {
    expect(names({ billing: true })).toEqual([
      "general",
      "privacy",
      "theme",
      "banner",
      "advanced",
      "users",
      "invitations",
      "authentication",
      "tags",
      "products",
      "statuses",
      "scorecard-settings",
      "ai",
      "mcp",
      "webhooks",
      "billing",
      "export",
      "danger-zone",
    ])
  })

  test("collaborators see General, Tags, Scorecard and Invitations only", () => {
    expect(names({ role: "collaborator", billing: true })).toEqual(["general", "invitations", "tags", "scorecard-settings"])
  })

  test("billing only when billing is on; danger zone only in multi-host mode", () => {
    expect(names({})).not.toContain("billing")
    expect(names({ billing: true })).toContain("billing")
    expect(names({ single: true })).not.toContain("danger-zone")
  })

  test("moderation only on a paid plan with moderation on, for staff", () => {
    expect(names({ pro: false, moderation: true })).not.toContain("moderation")
    expect(names({ pro: true, moderation: false })).not.toContain("moderation")
    expect(names({ pro: true, moderation: true })).toContain("moderation")
    expect(names({ role: "collaborator", pro: true, moderation: true })).toContain("moderation")
  })

  test("the layout marks the current page and shows the System box to admins only", () => {
    httpMock.alwaysOk()
    const asAdmin = withFider(
      staff(),
      <AdminLayout name="tags" title="Tags">
        <p>x</p>
      </AdminLayout>
    )
    expect(asAdmin.container.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe("/admin/tags")
    expect(asAdmin.container.querySelector(".u2-sys")).not.toBeNull()
    asAdmin.unmount()

    const asCollab = withFider(
      staff({ role: "collaborator" }),
      <AdminLayout name="tags" title="Tags">
        <p>x</p>
      </AdminLayout>
    )
    expect(asCollab.container.querySelector(".u2-sys")).toBeNull()
    expect(asCollab.container.querySelectorAll(".u2-admin__nav a")).toHaveLength(4)
  })
})

describe("ui2 Look cards", () => {
  const reload = jest.fn()
  beforeAll(() => {
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload, href: "http://demo.test/admin" } })
  })
  beforeEach(() => reload.mockClear())

  // The confirm dialog's footer buttons: Cancel first, the confirm last.
  const footButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".u2-dlg__foot button"))
  const radios = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLInputElement>('input[type="radio"][name="ui"]'))

  test("two cards, the stored look checked", () => {
    httpMock.alwaysOk()
    const { container } = withFider(staff(), <LookPicker stored="classic" />)
    const [newLook, classic] = radios(container)
    expect(radios(container)).toHaveLength(2)
    expect(classic.checked).toBe(true)
    expect(newLook.checked).toBe(false)
  })

  test("saves once and reloads; a second pick while saving is ignored", async () => {
    let resolve: (v: unknown) => void = () => undefined
    const post = jest.fn(() => new Promise((r) => (resolve = r)))
    http.post = post as unknown as typeof http.post
    const { container } = withFider(staff(), <LookPicker stored="classic" />)
    const [newLook, classic] = radios(container)

    fireEvent.click(newLook)
    expect(post).toHaveBeenCalledWith("/_api/admin/settings/look", { ui: "new" })
    expect(newLook.disabled).toBe(true)
    fireEvent.click(classic)
    expect(post).toHaveBeenCalledTimes(1)

    await act(async () => resolve({ ok: true }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  test("a failed save puts the cards back on the stored look and allows a retry", async () => {
    const post = jest.fn(() => Promise.resolve({ ok: false, error: { errors: [] } }))
    http.post = post as unknown as typeof http.post
    const { container } = withFider(staff(), <LookPicker stored="classic" />)
    const [newLook, classic] = radios(container)

    await act(async () => fireEvent.click(newLook))
    expect(reload).not.toHaveBeenCalled()
    expect(classic.checked).toBe(true)
    expect(newLook.checked).toBe(false)
    expect(newLook.disabled).toBe(false)
    expect(container.querySelector('[role="alert"]')).not.toBeNull()

    await act(async () => fireEvent.click(newLook))
    expect(post).toHaveBeenCalledTimes(2)
  })

  test("a thrown request also resets", async () => {
    setupModalRoot()
    http.post = jest.fn(() => Promise.reject(new Error("net"))) as unknown as typeof http.post
    const { container } = withFider(staff(), <LookPicker stored="new" />)
    const [newLook, classic] = radios(container)
    fireEvent.click(classic)
    await act(async () => fireEvent.click(footButtons().pop() as HTMLElement))
    expect(newLook.checked).toBe(true)
  })

  test("switching to Classic asks first; Cancel keeps the Upvora look", () => {
    setupModalRoot()
    const post = jest.fn(() => Promise.resolve({ ok: true }))
    http.post = post as unknown as typeof http.post
    const { container } = withFider(staff(), <LookPicker stored="new" />)
    const [newLook, classic] = radios(container)
    fireEvent.click(classic)
    expect(post).not.toHaveBeenCalled()
    fireEvent.click(footButtons()[0])
    expect(post).not.toHaveBeenCalled()
    expect(newLook.checked).toBe(true)
  })

  test("only administrators see the Look on General", () => {
    httpMock.alwaysOk()
    const admin = withFider(staff(), <GeneralSettingsPage />)
    expect(radios(admin.container)).toHaveLength(2)
    admin.unmount()
    const collab = withFider(staff({ role: "collaborator" }), <GeneralSettingsPage />)
    expect(radios(collab.container)).toHaveLength(0)
    // Collaborators read General with every input disabled.
    expect((collab.container.querySelector('input[name="title"]') as HTMLInputElement).disabled).toBe(true)
  })
})

describe("ui2 General save", () => {
  beforeAll(() => setupModalRoot())

  test("sends every classic field, with defaultTheme riding along", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(staff(), <GeneralSettingsPage />)
    fireEvent.change(container.querySelector('input[name="title"]') as HTMLInputElement, { target: { value: "Acme Labs" } })
    fireEvent.change(container.querySelector('input[name="cname"]') as HTMLInputElement, { target: { value: "feedback.acme.com" } })
    // The DNS hint follows the domain: a subdomain gets a CNAME record.
    expect(container.querySelector('[data-testid="u2-dns"]')?.textContent).toContain("CNAME")
    await act(async () => fireEvent.submit(container.querySelector("form") as HTMLFormElement))
    await waitFor(() => expect(mock.post).toHaveBeenCalled())
    expect(mock.post).toHaveBeenCalledWith("/_api/admin/settings/general", {
      title: "Acme Labs",
      cname: "feedback.acme.com",
      welcomeMessage: "Hi",
      welcomeHeader: "Head",
      descriptionTemplate: "",
      shareIdeaInstructions: "",
      railCtaHeading: "",
      railCtaText: "",
      railCtaButton: "",
      defaultTheme: "light",
      invitation: "Say",
      logo: undefined,
      locale: "en",
    })
  })

  test("the custom domain field is hidden in single-host mode", () => {
    httpMock.alwaysOk()
    const { container } = withFider(staff({ single: true }), <GeneralSettingsPage />)
    expect(container.querySelector('input[name="cname"]')).toBeNull()
  })

  test("server field errors land next to their fields", async () => {
    http.post = jest.fn(() =>
      Promise.resolve({ ok: false, error: { errors: [{ field: "title", message: "Title is required." }] } })
    ) as unknown as typeof http.post
    http.get = jest.fn(() => Promise.resolve({ ok: false })) as unknown as typeof http.get
    const { container } = withFider(staff(), <GeneralSettingsPage />)
    await act(async () => fireEvent.submit(container.querySelector("form") as HTMLFormElement))
    expect((container.querySelector('input[name="title"]') as HTMLInputElement).getAttribute("aria-invalid")).toBe("true")
  })
})

describe("ui2 Advanced", () => {
  test("shows both Custom CSS fields and saves them together", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(staff(), <AdvancedSettingsPage customCSS=".c{}" ui2CustomCSS=".u2{}" allowedSchemes="" />)
    expect((container.querySelector('textarea[name="customCSS"]') as HTMLTextAreaElement).value).toBe(".c{}")
    const ui2 = container.querySelector('textarea[name="ui2CustomCSS"]') as HTMLTextAreaElement
    expect(ui2.value).toBe(".u2{}")
    fireEvent.change(ui2, { target: { value: ".u2-row{gap:0}" } })
    await act(async () => fireEvent.submit(container.querySelector("form") as HTMLFormElement))
    expect(mock.post).toHaveBeenCalledWith("/_api/admin/settings/advanced", { customCSS: ".c{}", allowedSchemes: "", ui2CustomCSS: ".u2-row{gap:0}" })
  })
})

describe("ui2 admin layout", () => {
  test("the nav is grouped into sections, with a select for phones", () => {
    httpMock.alwaysOk()
    const { container } = withFider(
      staff({ role: "collaborator" }),
      <AdminLayout name="tags" title="Tags">
        <p>x</p>
      </AdminLayout>
    )
    expect(container.querySelectorAll(".u2-admin__navgroup")).toHaveLength(3)
    const jump = container.querySelector("#u2-admin-jump") as HTMLSelectElement
    expect(jump.value).toBe("/admin/tags")
    expect(jump.querySelectorAll("optgroup")).toHaveLength(3)
  })

  test("General focuses the welcome message when the board links to #welcome-message", () => {
    httpMock.alwaysOk()
    const scroll = jest.fn()
    Element.prototype.scrollIntoView = scroll
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, hash: "#welcome-message" } })
    const { container } = withFider(staff(), <GeneralSettingsPage />)
    const field = container.querySelector("#welcome-message textarea")
    expect(field).not.toBeNull()
    expect(document.activeElement).toBe(field)
    expect(scroll).toHaveBeenCalled()
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, hash: "" } })
  })
})
