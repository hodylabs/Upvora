import React from "react"
import { act, fireEvent, render } from "@testing-library/react"
import { http } from "@fider/services"
import { InternalNote as Note } from "@fider/models"
import { InternalNote, NOTE_SAVE_DELAY } from "./InternalNote"

type Res = { ok: boolean; data: Note }
const deferred = () => {
  let resolve: (r: Res) => void = () => undefined
  const promise = new Promise<Res>((r) => (resolve = r))
  return { promise, resolve }
}
const note = (content: string) => ({ ok: true, data: { content, updatedByName: "Ada" } as unknown as Note })
const URL = "/_api/posts/1/internal-note"
const box = () => document.querySelector("textarea") as HTMLTextAreaElement
const type = (value: string) => fireEvent.change(box(), { target: { value } })

describe("ui2 <InternalNote />", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test("a note that loads after typing started does not replace the draft", async () => {
    const load = deferred()
    http.get = jest.fn(() => load.promise) as unknown as typeof http.get
    render(<InternalNote postNumber={1} />)
    type("my draft")
    await act(async () => load.resolve(note("old note")))
    expect(box().value).toBe("my draft")
  })

  test("one save at a time, and text typed during a save is sent after it", async () => {
    const first = deferred()
    const second = deferred()
    const set = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    http.put = set as unknown as typeof http.put
    render(<InternalNote postNumber={1} initial={{ content: "" } as Note} />)

    type("A")
    act(() => jest.advanceTimersByTime(NOTE_SAVE_DELAY))
    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenLastCalledWith(URL, { content: "A" })

    // Newer text while "A" is in flight: its save waits for "A" to finish.
    type("AB")
    act(() => jest.advanceTimersByTime(NOTE_SAVE_DELAY))
    expect(set).toHaveBeenCalledTimes(1)

    await act(async () => first.resolve(note("A")))
    expect(set).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenLastCalledWith(URL, { content: "AB" })
    await act(async () => second.resolve(note("AB")))
    expect(box().value).toBe("AB")
  })

  test("blur during a save queues the latest text instead of a parallel request", async () => {
    const first = deferred()
    const set = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(Promise.resolve(note("xy")))
    http.put = set as unknown as typeof http.put
    render(<InternalNote postNumber={1} initial={{ content: "" } as Note} />)
    type("x")
    fireEvent.blur(box())
    type("xy")
    fireEvent.blur(box())
    expect(set).toHaveBeenCalledTimes(1)
    await act(async () => first.resolve(note("x")))
    expect(set).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenLastCalledWith(URL, { content: "xy" })
  })

  test("a rejected save releases the latch, so the next edit saves", async () => {
    const set = jest
      .fn()
      .mockReturnValueOnce(Promise.reject(new Error("network")))
      .mockReturnValueOnce(Promise.resolve(note("ab")))
    http.put = set as unknown as typeof http.put
    render(<InternalNote postNumber={1} initial={{ content: "" } as Note} />)
    type("a")
    await act(async () => fireEvent.blur(box()))
    expect(set).toHaveBeenCalledTimes(1)
    type("ab")
    await act(async () => fireEvent.blur(box()))
    expect(set).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenLastCalledWith(URL, { content: "ab" })
  })

  test("text queued during a failed save is still sent", async () => {
    const first = deferred()
    const set = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(Promise.resolve(note("xy")))
    http.put = set as unknown as typeof http.put
    render(<InternalNote postNumber={1} initial={{ content: "" } as Note} />)
    type("x")
    fireEvent.blur(box())
    type("xy")
    fireEvent.blur(box())
    await act(async () => first.resolve({ ok: false, data: {} as Note }))
    expect(set).toHaveBeenCalledTimes(2)
    expect(set).toHaveBeenLastCalledWith(URL, { content: "xy" })
  })

  test("a failed save with nothing newer does not retry on its own", async () => {
    const set = jest.fn().mockReturnValue(Promise.resolve({ ok: false, data: {} }))
    http.put = set as unknown as typeof http.put
    render(<InternalNote postNumber={1} initial={{ content: "" } as Note} />)
    type("x")
    await act(async () => fireEvent.blur(box()))
    act(() => jest.advanceTimersByTime(NOTE_SAVE_DELAY * 3))
    expect(set).toHaveBeenCalledTimes(1)
  })
})
