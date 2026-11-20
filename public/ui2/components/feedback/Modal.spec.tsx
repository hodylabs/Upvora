import React, { useState } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { Modal } from "./Modal"
import { ConfirmDialog } from "./ConfirmDialog"

const Harness = (props: { onClose?: () => void }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <Modal
        open={open}
        onClose={() => {
          props.onClose?.()
          setOpen(false)
        }}
        title="Title"
        footer={<button>last</button>}
      >
        <input aria-label="first" />
      </Modal>
    </>
  )
}

const tab = (shift = false) => fireEvent.keyDown(document.activeElement || document.body, { key: "Tab", shiftKey: shift })

describe("ui2 <Modal />", () => {
  test("is an aria-modal dialog in #root-modal and focuses its first field", () => {
    const root = document.createElement("div")
    root.id = "root-modal"
    document.body.appendChild(root)
    render(<Harness />)
    fireEvent.click(screen.getByText("opener"))
    const dialog = screen.getByRole("dialog")
    expect(dialog.getAttribute("aria-modal")).toBe("true")
    expect(root.contains(dialog)).toBe(true)
    expect(document.activeElement).toBe(screen.getByLabelText("first"))
    root.remove()
  })

  test("Tab and Shift+Tab stay inside", () => {
    render(<Harness />)
    fireEvent.click(screen.getByText("opener"))
    screen.getByText("last").focus()
    tab()
    // wraps to the first focusable: the close button in the header
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(screen.getByText("last"))
    const first = document.activeElement
    tab(true)
    expect(document.activeElement).toBe(screen.getByText("last"))
    expect(first).not.toBe(document.activeElement)
  })

  test("Esc closes and focus returns to the opener", () => {
    const onClose = jest.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByText("opener")
    opener.focus()
    fireEvent.click(opener)
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})

describe("ui2 <ConfirmDialog />", () => {
  test("confirm runs the action and stays locked until it settles", async () => {
    let finish: () => void = () => undefined
    const onConfirm = jest.fn(() => new Promise<void>((r) => (finish = r)))
    const onCancel = jest.fn()
    render(
      <ConfirmDialog open title="Delete?" onConfirm={onConfirm} onCancel={onCancel}>
        <p>sure?</p>
      </ConfirmDialog>
    )
    const buttons = screen.getAllByRole("button")
    const confirm = buttons[buttons.length - 1]
    fireEvent.click(confirm)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(confirm.getAttribute("aria-busy")).toBe("true")
    // locked: Esc does not cancel while the action runs
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(onCancel).not.toHaveBeenCalled()
    await act(async () => finish())
    expect(confirm.getAttribute("aria-busy")).toBeNull()
  })

  test("cancel calls onCancel", () => {
    const onCancel = jest.fn()
    render(
      <ConfirmDialog open title="Delete?" onConfirm={jest.fn()} onCancel={onCancel}>
        <p>sure?</p>
      </ConfirmDialog>
    )
    // first focusable after the close button is Cancel
    expect(document.activeElement?.className).toContain("u2-btn--ghost")
    fireEvent.click(document.activeElement as Element)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
