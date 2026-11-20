import React from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { Menu } from "./Menu"

const items = [
  { key: "a", label: "Alpha", href: "/a" },
  { key: "b", label: "Beta", onSelect: jest.fn() },
]

describe("ui2 <Menu />", () => {
  test("ArrowUp on the button opens at the last item; Home, End and Esc work; Esc returns focus", () => {
    render(<Menu trigger="Open" items={items} />)
    const button = screen.getByRole("button", { name: "Open" })
    button.focus()
    fireEvent.keyDown(button, { key: "ArrowUp" })
    const [a, b] = screen.getAllByRole("menuitem")
    expect(document.activeElement).toBe(b)
    fireEvent.keyDown(b, { key: "Home" })
    expect(document.activeElement).toBe(a)
    fireEvent.keyDown(a, { key: "ArrowUp" })
    expect(document.activeElement).toBe(b)
    fireEvent.keyDown(b, { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  test("Tab and a click outside close it; picking an item runs it and closes", () => {
    render(<Menu trigger="Open" items={items} />)
    const button = screen.getByRole("button", { name: "Open" })
    fireEvent.click(button)
    fireEvent.keyDown(screen.getAllByRole("menuitem")[0], { key: "Tab" })
    expect(screen.queryByRole("menu")).toBeNull()
    fireEvent.click(button)
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole("menu")).toBeNull()
    fireEvent.click(button)
    fireEvent.click(screen.getByText("Beta"))
    expect(items[1].onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
