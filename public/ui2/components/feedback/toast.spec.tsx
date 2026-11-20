import { act } from "@testing-library/react"
import { createRoot } from "react-dom/client"
import React from "react"
import { toast } from "./toast"

describe("ui2 toast", () => {
  test("mounts an empty status region outside #root-toastify, then shows the message", async () => {
    const classic = document.createElement("div")
    classic.id = "root-toastify"
    document.body.appendChild(classic)

    act(() => {
      toast.success("first")
    })
    const host = document.getElementById("root-u2-toast") as HTMLElement
    expect(host).not.toBeNull()
    expect(host.getAttribute("role")).toBe("status")
    expect(classic.contains(host)).toBe(false)
    expect(host.previousElementSibling).toBe(classic)
    expect(host.textContent).toContain("first")

    // classic notifications take over #root-toastify with their own React root
    await act(async () => {
      createRoot(classic).render(<p>classic</p>)
    })
    act(() => {
      toast.error("second")
    })
    expect(document.getElementById("root-u2-toast")).toBe(host)
    expect(host.isConnected).toBe(true)
    expect(host.textContent).toContain("second")
  })

  test("re-attaches a fresh host if the old one was removed", () => {
    document.getElementById("root-u2-toast")?.remove()
    act(() => {
      toast.success("again")
    })
    const host = document.getElementById("root-u2-toast") as HTMLElement
    expect(host.isConnected).toBe(true)
    expect(host.textContent).toContain("again")
  })
})
