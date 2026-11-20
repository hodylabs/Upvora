import React from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { Fider } from "@fider/services"
import { ImageUploader } from "./ImageUploader"

Fider.initialize({ settings: { environment: "development", oauth: [], assetsURL: "" }, tenant: {}, user: undefined })

const pick = (name: string) =>
  fireEvent.change(screen.getByTestId("u2-image-file"), { target: { files: [new File(["png-bytes"], name, { type: "image/png" })] } })

const settle = () => act(async () => new Promise((r) => setTimeout(r, 20)))

describe("ui2 <ImageUploader />", () => {
  test("Remove before the file read finishes wins over the late read", async () => {
    const onChange = jest.fn()
    const { container } = render(<ImageUploader bkey="logos/a.png" onChange={onChange} />)
    pick("b.png")
    fireEvent.click(container.querySelector(".u2-btn--ghost") as HTMLButtonElement)
    await settle()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ bkey: "logos/a.png", remove: true })
    expect(container.querySelector(".u2-upload__preview")).toBeNull()
  })

  test("only the latest of two picks is reported", async () => {
    const onChange = jest.fn()
    render(<ImageUploader onChange={onChange} />)
    pick("first.png")
    pick("second.png")
    await settle()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0].upload.fileName).toBe("second.png")
  })
})
