import React from "react"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { Editor } from "@tiptap/react"
import { closeHistory } from "@tiptap/pm/history"
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

  const editorOf = (container: HTMLElement) => (container.querySelector(".ProseMirror") as unknown as { editor: Editor }).editor
  const pickImage = (container: HTMLElement, name: string) =>
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, {
      target: { files: [new File(["png-bytes"], name, { type: "image/png" })] },
    })

  test("Undo after deleting a new image sends its upload again", async () => {
    const onImageUploaded = jest.fn()
    const { container } = renderEditor({ onImageUploaded })
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull())
    pickImage(container, "a.png")
    await waitFor(() => expect(onImageUploaded).toHaveBeenCalledTimes(1))
    const added = onImageUploaded.mock.calls[0][0]
    expect(added.remove).toBe(false)
    expect(added.upload.fileName).toBe("a.png")

    const editor = editorOf(container)
    act(() => {
      // a separate history step, as a later user action would be
      editor.view.dispatch(closeHistory(editor.state.tr))
      editor.chain().selectAll().deleteSelection().run()
    })
    expect(onImageUploaded).toHaveBeenLastCalledWith({ bkey: added.bkey, remove: true })
    act(() => {
      editor.commands.undo()
    })
    expect(onImageUploaded).toHaveBeenLastCalledWith({ bkey: added.bkey, upload: added.upload, remove: false })
  })

  test("raw-mode edits report removed and restored stored images and free the slot", async () => {
    const onImageUploaded = jest.fn()
    const md = "![](fider-image:attachments/a.png)"
    const { container } = renderEditor({ initialValue: md, onImageUploaded, maxAttachments: 1 })
    await waitFor(() => expect(container.querySelector(".ProseMirror img")).not.toBeNull())
    fireEvent.click(container.querySelector(".u2-md__mode") as HTMLButtonElement)
    const raw = screen.getByTestId("u2-markdown-raw")
    fireEvent.change(raw, { target: { value: "text" } })
    expect(onImageUploaded).toHaveBeenLastCalledWith({ bkey: "attachments/a.png", remove: true })
    fireEvent.change(raw, { target: { value: md } })
    expect(onImageUploaded).toHaveBeenLastCalledWith({ bkey: "attachments/a.png", upload: undefined, remove: false })
    fireEvent.change(raw, { target: { value: "text" } })
    // back to rich mode: the limit of 1 has room again
    fireEvent.click(container.querySelector(".u2-md__mode") as HTMLButtonElement)
    onImageUploaded.mockClear()
    pickImage(container, "b.png")
    await waitFor(() => expect(onImageUploaded).toHaveBeenCalledWith(expect.objectContaining({ remove: false, upload: expect.anything() })))
  })

  test("raw mode counts images with the editor's parser: a titled reference is still the same image", async () => {
    const onImageUploaded = jest.fn()
    const { container } = renderEditor({ initialValue: "![](fider-image:attachments/a.png)", onImageUploaded })
    await waitFor(() => expect(container.querySelector(".ProseMirror img")).not.toBeNull())
    fireEvent.click(container.querySelector(".u2-md__mode") as HTMLButtonElement)
    fireEvent.change(screen.getByTestId("u2-markdown-raw"), { target: { value: '![](fider-image:attachments/a.png "caption")' } })
    expect(onImageUploaded).not.toHaveBeenCalledWith(expect.objectContaining({ remove: true }))
    // inside a code block it is text, not an image
    fireEvent.change(screen.getByTestId("u2-markdown-raw"), { target: { value: "```\n![](fider-image:attachments/a.png)\n```" } })
    expect(onImageUploaded).toHaveBeenLastCalledWith({ bkey: "attachments/a.png", remove: true })
  })

  test("an image from a cached draft, removed and restored, is sent again with its bytes", async () => {
    const onImageUploaded = jest.fn()
    const draft = { fileName: "d.png", content: "AAAA", contentType: "image/png" }
    const md = "![](fider-image:attachments/draft.png)"
    const { container } = renderEditor({
      initialValue: md,
      onImageUploaded,
      onGetImageSrc: () => "AAAA",
      onGetUpload: (bkey) => (bkey === "attachments/draft.png" ? draft : undefined),
    })
    await waitFor(() => expect(container.querySelector(".ProseMirror img")).not.toBeNull())
    fireEvent.click(container.querySelector(".u2-md__mode") as HTMLButtonElement)
    const raw = screen.getByTestId("u2-markdown-raw")
    fireEvent.change(raw, { target: { value: "gone" } })
    expect(onImageUploaded).toHaveBeenLastCalledWith({ bkey: "attachments/draft.png", remove: true })
    fireEvent.change(raw, { target: { value: md } })
    expect(onImageUploaded).toHaveBeenLastCalledWith({ bkey: "attachments/draft.png", upload: draft, remove: false })
  })

  test("re-checks the image limit after reading the file", async () => {
    const onImageUploaded = jest.fn()
    const { container } = renderEditor({ onImageUploaded, maxAttachments: 1 })
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull())
    // both reads start before either image lands
    pickImage(container, "a.png")
    pickImage(container, "b.png")
    await waitFor(() => expect(onImageUploaded).toHaveBeenCalledTimes(1))
    await act(async () => new Promise((r) => setTimeout(r, 20)))
    expect(onImageUploaded).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll(".ProseMirror img:not(.ProseMirror-separator)").length).toBe(1)
  })

  test("the link dialog footer button is the submit button of its form", async () => {
    const { container } = renderEditor()
    await waitFor(() => expect(container.querySelector(".ProseMirror")).not.toBeNull())
    fireEvent.click(screen.getByLabelText("Insert link"))
    const submit = document.querySelector('.u2-dlg__foot button[type="submit"]') as HTMLButtonElement
    const form = document.getElementById(submit.getAttribute("form") as string)
    expect(form?.tagName).toBe("FORM")
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
