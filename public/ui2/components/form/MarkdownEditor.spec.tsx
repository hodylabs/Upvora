import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Fider, FiderContext } from "@fider/services"
import { MarkdownEditor } from "./MarkdownEditor"

const fider = Fider.initialize({
  settings: { environment: "development", oauth: [] },
  tenant: { allowedSchemes: "" },
  user: undefined,
})

const renderEditor = (props: Partial<React.ComponentProps<typeof MarkdownEditor>> = {}) =>
  render(
    <FiderContext.Provider value={fider}>
      <MarkdownEditor field="description" label="Description" initialValue="" {...props} />
    </FiderContext.Provider>
  )

describe("ui2 <MarkdownEditor />", () => {
  test("loads Markdown into the rich editor, with mentions and stored images", async () => {
    const { container } = renderEditor({ initialValue: "Hello **world** @[Ada]\n\n![](fider-image:attachments/a.png)" })
    await waitFor(() => expect(container.querySelector(".ProseMirror strong")?.textContent).toBe("world"))
    expect(container.querySelector(".ProseMirror .mention")?.textContent).toContain("Ada")
    expect(container.querySelector(".ProseMirror img:not(.ProseMirror-separator)")?.getAttribute("src")).toBe("/static/images/attachments/a.png")
    expect(screen.getByRole("textbox", { name: "Description" })).toBeDefined()
  })

  test("markdown mode shows the same Markdown and reports edits", async () => {
    const onChange = jest.fn()
    const { container } = renderEditor({ initialValue: "Hello **world**", onChange })
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull())
    fireEvent.click(container.querySelector(".u2-md__mode") as HTMLButtonElement)
    const raw = screen.getByTestId("u2-markdown-raw") as HTMLTextAreaElement
    expect(raw.value).toBe("Hello **world**")
    fireEvent.change(raw, { target: { value: "Bye" } })
    expect(onChange).toHaveBeenLastCalledWith("Bye")
  })

  test("the toolbar is labelled and its buttons say what they do", async () => {
    const { container } = renderEditor()
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull())
    const tools = Array.from(container.querySelectorAll<HTMLButtonElement>(".u2-md__tool"))
    expect(tools.length).toBeGreaterThan(10)
    // every icon tool has a name (the mode switch has visible text, empty under jest)
    tools.filter((b) => !b.classList.contains("u2-md__mode")).forEach((b) => expect(b.getAttribute("aria-label")).toBeTruthy())
  })
})
