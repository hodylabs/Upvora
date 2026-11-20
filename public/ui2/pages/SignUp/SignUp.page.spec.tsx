import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Fider, FiderContext, http } from "@fider/services"
import SignUpPage from "./SignUp.page"

const fider = Fider.initialize({
  settings: { environment: "development", oauth: [], locale: "en", mode: "multi", domain: ".demo.test" },
  tenant: {},
  user: undefined,
})

const renderPage = () =>
  render(
    <FiderContext.Provider value={fider}>
      <SignUpPage />
    </FiderContext.Provider>
  )

const typeSubdomain = async (value: string) => {
  jest.useFakeTimers()
  fireEvent.change(screen.getByLabelText("Subdomain"), { target: { value } })
  await act(async () => {
    jest.advanceTimersByTime(600)
  })
  jest.useRealTimers()
}

describe("ui2 SignUp page", () => {
  const origGet = http.get
  const origPost = http.post
  afterEach(() => {
    http.get = origGet
    http.post = origPost
  })

  test("a failed availability check is not shown as available", async () => {
    http.get = jest.fn(() => Promise.resolve({ ok: false, data: {} })) as unknown as typeof http.get
    const { container } = renderPage()
    await typeSubdomain("acme")
    await waitFor(() => expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull())
    expect(container.querySelector(".u2-signin__ok")).toBeNull()
  })

  test("a lookup that throws is not shown as available either", async () => {
    http.get = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof http.get
    const { container } = renderPage()
    await typeSubdomain("acme")
    await waitFor(() => expect(container.querySelector('[aria-invalid="true"]')).not.toBeNull())
    expect(container.querySelector(".u2-signin__ok")).toBeNull()
  })

  test("an available subdomain says so", async () => {
    http.get = jest.fn(() => Promise.resolve({ ok: true, data: { message: "" } })) as unknown as typeof http.get
    const { container } = renderPage()
    await typeSubdomain("acme")
    await waitFor(() => expect(container.querySelector(".u2-signin__ok")).not.toBeNull())
  })

  test("a rejected createTenant clears busy and shows a form error", async () => {
    http.get = jest.fn(() => Promise.resolve({ ok: true, data: { message: "" } })) as unknown as typeof http.get
    http.post = jest.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof http.post
    const { container } = renderPage()
    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement
    fireEvent.click(submit)
    await waitFor(() => expect(container.querySelector(".u2-form__error")).not.toBeNull())
    expect(http.post).toHaveBeenCalledTimes(1)
    expect(submit.getAttribute("aria-busy")).toBeNull()
    expect(submit.disabled).toBe(false)
  })
})
