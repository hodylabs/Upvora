import React, { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { Failure } from "@fider/services"
import { Form, errorsFor, unplacedErrors } from "./Form"
import { TextInput } from "./TextInput"
import { Toggle } from "./Choice"

const failure: Failure = {
  errors: [
    { field: "title", message: "Title is too short." },
    { field: "title", message: "Title is taken." },
    { field: "ghost", message: "A field not on screen." },
    { message: "General problem." },
  ],
}

const Harness = (props: { onSubmit?: () => void }) => {
  const [title, setTitle] = useState("")
  return (
    <Form error={failure} onSubmit={props.onSubmit}>
      <TextInput name="title" label="Title" value={title} onChange={setTitle} />
      <TextInput name="other" label="Other" value="" onChange={() => undefined} />
    </Form>
  )
}

describe("ui2 Form error mapping", () => {
  test("pure helpers split field and general messages", () => {
    expect(errorsFor(failure, "title")).toEqual(["Title is too short.", "Title is taken."])
    expect(unplacedErrors(failure, ["title"])).toEqual(["A field not on screen.", "General problem."])
  })

  test("field messages sit under their field; the rest go to the top box", () => {
    const { container } = render(<Harness />)
    const title = container.querySelector('input[name="title"]') as HTMLInputElement
    const other = container.querySelector('input[name="other"]') as HTMLInputElement
    expect(title.getAttribute("aria-invalid")).toBe("true")
    expect(other.getAttribute("aria-invalid")).toBeNull()

    const describedBy = (title.getAttribute("aria-describedby") || "").split(" ")
    const errorBox = describedBy.map((id) => document.getElementById(id)).find((el) => el?.className === "u2-fld__error")
    expect(errorBox?.textContent).toBe("Title is too short.Title is taken.")

    const top = container.querySelector(".u2-form__error") as HTMLElement
    expect(top.textContent).toContain("General problem.")
    expect(top.textContent).toContain("A field not on screen.")
    expect(top.textContent).not.toContain("Title is too short.")
  })

  test("typing in a field clears its error", () => {
    const { container } = render(<Harness />)
    const title = container.querySelector('input[name="title"]') as HTMLInputElement
    fireEvent.change(title, { target: { value: "A longer title" } })
    expect(title.getAttribute("aria-invalid")).toBeNull()
    expect(container.textContent).not.toContain("Title is taken.")
    expect(container.textContent).toContain("General problem.")
  })

  test("submit calls onSubmit without a page load", () => {
    const onSubmit = jest.fn()
    const { container } = render(<Harness onSubmit={onSubmit} />)
    fireEvent.submit(container.querySelector("form") as HTMLFormElement)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  test("the label is wired to its input", () => {
    render(<Harness />)
    expect((screen.getByLabelText("Title") as HTMLInputElement).name).toBe("title")
  })
})

describe("ui2 <Toggle />", () => {
  test("is a switch whose aria-checked follows the value", () => {
    const Wrap = () => {
      const [on, setOn] = useState(false)
      return <Toggle label="Email me" checked={on} onChange={setOn} />
    }
    render(<Wrap />)
    const sw = screen.getByRole("switch", { name: "Email me" })
    expect(sw.getAttribute("aria-checked")).toBe("false")
    fireEvent.click(sw)
    expect(sw.getAttribute("aria-checked")).toBe("true")
    fireEvent.click(sw)
    expect(sw.getAttribute("aria-checked")).toBe("false")
  })
})
