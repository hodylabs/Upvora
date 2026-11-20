import React, { useState } from "react"
import { render, fireEvent } from "@testing-library/react"
import { useRowKeys, isTypingTarget } from "./useRowKeys"

const calls = { vote: jest.fn(), open: jest.fn(), merge: jest.fn(), esc: jest.fn() }

const Harness = (props: { count: number; staff?: boolean }) => {
  const [focused, setFocused] = useState(-1)
  useRowKeys({
    count: props.count,
    focused,
    setFocused,
    onVote: calls.vote,
    onOpen: calls.open,
    onMerge: props.staff ? calls.merge : undefined,
    onEscape: calls.esc,
  })
  return (
    <div>
      <span data-testid="focused">{focused}</span>
      <input data-testid="field" />
      <textarea data-testid="area" />
    </div>
  )
}

const press = (key: string, target: Element = document.body) => fireEvent.keyDown(target, { key })

describe("ui2 row keys", () => {
  beforeEach(() => Object.values(calls).forEach((c) => c.mockClear()))

  test("J and K move the focused row and stay in range", () => {
    const { getByTestId } = render(<Harness count={3} />)
    const focused = () => getByTestId("focused").textContent
    press("j")
    expect(focused()).toBe("0")
    press("j")
    press("j")
    press("j")
    expect(focused()).toBe("2")
    press("k")
    expect(focused()).toBe("1")
    press("K")
    press("k")
    expect(focused()).toBe("0")
  })

  test("V votes and Enter opens the focused row", () => {
    render(<Harness count={3} />)
    press("v")
    press("Enter")
    expect(calls.vote).not.toHaveBeenCalled()
    expect(calls.open).not.toHaveBeenCalled()
    press("j")
    press("j")
    press("v")
    press("Enter")
    expect(calls.vote).toHaveBeenCalledWith(1)
    expect(calls.open).toHaveBeenCalledWith(1)
  })

  test("M merges for staff only", () => {
    const { unmount } = render(<Harness count={2} />)
    press("j")
    press("m")
    expect(calls.merge).not.toHaveBeenCalled()
    unmount()
    render(<Harness count={2} staff />)
    press("j")
    press("m")
    expect(calls.merge).toHaveBeenCalledWith(0)
  })

  test("keys are ignored while typing, except Esc", () => {
    const { getByTestId } = render(<Harness count={3} />)
    press("j", getByTestId("field"))
    press("v", getByTestId("area"))
    expect(getByTestId("focused").textContent).toBe("-1")
    expect(calls.vote).not.toHaveBeenCalled()
    press("Escape", getByTestId("field"))
    expect(calls.esc).toHaveBeenCalled()
  })

  test("modifier keys pass through (Ctrl+K is the Vora bar's)", () => {
    const { getByTestId } = render(<Harness count={3} />)
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true })
    fireEvent.keyDown(document.body, { key: "j", metaKey: true })
    expect(getByTestId("focused").textContent).toBe("-1")
  })

  test("isTypingTarget", () => {
    const div = document.createElement("div")
    expect(isTypingTarget(document.createElement("input"))).toBe(true)
    expect(isTypingTarget(document.createElement("select"))).toBe(true)
    expect(isTypingTarget(div)).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})
