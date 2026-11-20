import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { Fider, FiderContext } from "@fider/services"
import { httpMock } from "@fider/services/testing"
import { Status, WebhookStatus, WebhookType } from "@fider/models"
import { ColorInput, isHex, normalizeHex, expandHex } from "../components/ColorInput"
import { WebhookForm, PREVIEW_DELAY_MS } from "../components/webhook"
import ManageThemePage, { themeRequest } from "./ManageTheme.page"
import ManageWebhooksPage from "./ManageWebhooks.page"
import { moveSortOrder, ordered } from "./ManageStatuses.page"
import { parseTagsFile, tagSorter } from "./ManageTags.page"
import ManageProductsPage, { slugify } from "./ManageProducts.page"

// Trans renders empty under jest (@lingui/react is mocked), so these assert calls and structure.

const admin = () =>
  Fider.initialize({
    page: "Administration/pages/ManageTheme.page",
    settings: { environment: "development", oauth: [], baseURL: "http://demo.test", version: "1.0.0" },
    tenant: { name: "Demo", themePrimary: "", themeAccents: {}, defaultTheme: "light" },
    user: { name: "Ada", role: "administrator", isAdministrator: true, isCollaborator: true },
  })

const withFider = (el: React.ReactElement) => render(<FiderContext.Provider value={admin()}>{el}</FiderContext.Provider>)

describe("ui2 theme hex validation", () => {
  test("accepts #rgb and #rrggbb only", () => {
    expect(isHex("#abc")).toBe(true)
    expect(isHex("#A1B2C3")).toBe(true)
    expect(isHex("#abcd")).toBe(false)
    expect(isHex("abc")).toBe(false)
    expect(isHex("#ggg")).toBe(false)
    expect(isHex("")).toBe(false)
  })

  test("typed text gets a # and is trimmed", () => {
    expect(normalizeHex(" 3b82f6 ")).toBe("#3b82f6")
    expect(normalizeHex("#fff")).toBe("#fff")
    expect(normalizeHex("")).toBe("")
    expect(expandHex("#abc")).toBe("#aabbcc")
  })

  test("only valid hex reaches onChange, lower-cased; invalid is marked", () => {
    const onChange = jest.fn()
    render(<ColorInput label="Links" value="#3b82f6" onChange={onChange} />)
    const text = screen.getByRole("textbox")
    fireEvent.change(text, { target: { value: "12" } })
    expect(onChange).not.toHaveBeenCalled()
    expect(text.getAttribute("aria-invalid")).toBe("true")
    expect(screen.getByRole("alert")).toBeTruthy()
    fireEvent.change(text, { target: { value: "AABBCC" } })
    expect(onChange).toHaveBeenCalledWith("#aabbcc")
    expect(text.getAttribute("aria-invalid")).toBeNull()
  })

  test("theme request: default brand sends an empty primary", () => {
    expect(themeRequest("default", "#123456", { links: "#fff" }, "dark")).toEqual({ primary: "", accents: { links: "#fff" }, defaultTheme: "dark" })
    expect(themeRequest("custom", "#123456", {}, "light").primary).toBe("#123456")
  })

  test("an invalid hex never reaches the save: the last valid color is sent", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(<ManageThemePage />)
    const linksRow = container.querySelector('[data-surface="links"]') as HTMLElement
    const [, custom] = Array.from(linksRow.querySelectorAll("button"))
    fireEvent.click(custom)
    const hex = linksRow.querySelector('input[type="text"]') as HTMLInputElement
    fireEvent.change(hex, { target: { value: "#12" } })
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    })
    expect(mock.post).toHaveBeenCalledWith("/_api/admin/settings/theme", { primary: "", accents: { links: "#3B82F6" }, defaultTheme: "light" })
  })
})

const hook = {
  id: 7,
  name: "Slack",
  type: WebhookType.NEW_COMMENT,
  status: WebhookStatus.ENABLED,
  url: "https://hooks.test/x",
  content: "{}",
  http_method: "POST",
  http_headers: { "X-Key": "1" },
}

describe("ui2 webhook form", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test("prefills every field and saves the full payload", async () => {
    httpMock.alwaysOk()
    const onSave = jest.fn().mockResolvedValue(undefined)
    const { container } = withFider(<WebhookForm webhook={hook} onSave={onSave} onCancel={jest.fn()} />)
    expect((container.querySelector('input[name="name"]') as HTMLInputElement).value).toBe("Slack")
    expect((container.querySelector('select[name="type"]') as HTMLSelectElement).value).toBe("new_comment")
    expect((container.querySelector('input[name="url"]') as HTMLInputElement).value).toBe("https://hooks.test/x")
    expect((container.querySelector('input[name="http_method"]') as HTMLInputElement).value).toBe("POST")
    expect(container.querySelector('[data-header="X-Key"]')).not.toBeNull()

    fireEvent.change(container.querySelector('input[name="name"]') as HTMLInputElement, { target: { value: "Teams" } })
    fireEvent.click(screen.getByRole("switch"))
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    })
    expect(onSave).toHaveBeenCalledWith({ ...hook, id: undefined, name: "Teams", status: WebhookStatus.DISABLED } as unknown as typeof hook)
  })

  test("adds a header, refusing duplicates", async () => {
    httpMock.alwaysOk()
    const onSave = jest.fn().mockResolvedValue(undefined)
    const { container } = withFider(<WebhookForm webhook={hook} onSave={onSave} onCancel={jest.fn()} />)
    const row = container.querySelector('[data-header="new"]') as HTMLElement
    const [h, v] = Array.from(row.querySelectorAll("input"))
    const add = row.querySelector("button") as HTMLButtonElement
    fireEvent.change(h, { target: { value: "X-Key" } })
    fireEvent.change(v, { target: { value: "2" } })
    expect(add.disabled).toBe(true)
    fireEvent.change(h, { target: { value: "X-Other" } })
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    })
    expect(onSave.mock.calls[0][0].http_headers).toEqual({ "X-Key": "1", "X-Other": "2" })
  })

  test("previews on open and again after typing stops", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(<WebhookForm onSave={jest.fn()} onCancel={jest.fn()} />)
    expect(mock.post).toHaveBeenCalledWith("/_api/admin/webhook/preview", { type: "new_post", url: "", content: "" })
    ;(mock.post as jest.Mock).mockClear()
    fireEvent.change(container.querySelector('input[name="url"]') as HTMLInputElement, { target: { value: "https://a.test/{{ .post_id }}" } })
    expect(mock.post).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(PREVIEW_DELAY_MS)
    })
    expect(mock.post).toHaveBeenCalledWith("/_api/admin/webhook/preview", { type: "new_post", url: "https://a.test/{{ .post_id }}", content: "" })
  })

  test("create posts the form; test calls the test endpoint", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(<ManageWebhooksPage webhooks={[hook]} />)
    const testBtn = container.querySelector('li[data-id="7"] .u2-alist__acts button') as HTMLButtonElement
    await act(async () => {
      fireEvent.click(testBtn)
    })
    expect(mock.post).toHaveBeenCalledWith("/_api/admin/webhook/test/7")

    ;(mock.post as jest.Mock).mockImplementation(() => Promise.resolve({ ok: true, data: { id: 9 } }))
    fireEvent.click(container.querySelector(".u2-admin__secthead .u2-btn--primary") as HTMLButtonElement)
    fireEvent.change(container.querySelector('input[name="name"]') as HTMLInputElement, { target: { value: "New one" } })
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    })
    expect(mock.post).toHaveBeenCalledWith("/_api/admin/webhook", {
      name: "New one",
      type: "new_post",
      status: "enabled",
      url: "",
      content: "",
      http_method: "POST",
      http_headers: {},
    })
    expect(container.querySelector('li[data-id="9"]')).not.toBeNull()
  })

  test("edit puts to the webhook's id", async () => {
    const mock = httpMock.alwaysOk()
    const { container } = withFider(<ManageWebhooksPage webhooks={[hook]} />)
    fireEvent.click(container.querySelectorAll('li[data-id="7"] .u2-alist__acts button')[1])
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    })
    expect(mock.put).toHaveBeenCalledWith("/_api/admin/webhook/7", { ...hook, id: undefined } as unknown)
  })
})

const st = (id: number, sortOrder: number): Status => ({ id, sortOrder }) as Status

describe("ui2 statuses ordering", () => {
  test("orders by sortOrder then id", () => {
    expect(ordered([st(2, 100), st(1, 100), st(3, 5)]).map((s) => s.id)).toEqual([3, 1, 2])
  })
  test("moving places the row just past its neighbor, even on equal sortOrders", () => {
    const list = [st(1, 100), st(2, 100), st(3, 100)]
    expect(moveSortOrder(list, 2, -1)).toBe(99)
    expect(moveSortOrder(list, 2, 1)).toBe(101)
    expect(moveSortOrder(list, 1, -1)).toBeNull()
    expect(moveSortOrder(list, 3, 1)).toBeNull()
    expect(moveSortOrder(list, 9, 1)).toBeNull()
  })
})

describe("ui2 tags", () => {
  test("import file must be a JSON array", () => {
    expect("error" in parseTagsFile("{nope")).toBe(true)
    expect("error" in parseTagsFile('{"name":"a"}')).toBe(true)
    expect(parseTagsFile('[{"name":"a","color":"FF0000","isPublic":true}]')).toEqual({ tags: [{ name: "a", color: "FF0000", isPublic: true }] })
  })
  test("public tags first, then by name", () => {
    const tags = [
      { id: 1, name: "b", isPublic: false },
      { id: 2, name: "z", isPublic: true },
      { id: 3, name: "a", isPublic: false },
    ] as never[]
    expect([...tags].sort(tagSorter).map((t: { id: number }) => t.id)).toEqual([2, 3, 1])
  })
  test("product slugs", () => {
    expect(slugify("  Hello, World! ")).toBe("hello-world")
  })

  test("saving a product's details keeps an activation change made with the row toggle", async () => {
    const mock = httpMock.alwaysOk()
    const product = { id: 3, name: "App", slug: "app", description: "", color: "", sortOrder: 10, isActive: true }
    const { container } = withFider(<ManageProductsPage products={[product] as never[]} counts={{}} />)
    const row = container.querySelector('[data-id="3"]') as HTMLElement
    fireEvent.click(row.querySelector(".u2-btn--ghost") as HTMLElement)
    await act(async () => {
      fireEvent.click(row.querySelector('[role="switch"]') as HTMLElement)
    })
    expect(mock.put).toHaveBeenLastCalledWith("/_api/admin/products/3", expect.objectContaining({ isActive: false }))
    await act(async () => {
      fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    })
    expect(mock.put).toHaveBeenLastCalledWith("/_api/admin/products/3", expect.objectContaining({ name: "App", isActive: false }))
  })
})
