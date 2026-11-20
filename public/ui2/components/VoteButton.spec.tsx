import React from "react"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { Fider, FiderContext, http, navigator } from "@fider/services"
import { VoteButton } from "./VoteButton"

const fiderAs = (signedIn: boolean) =>
  Fider.initialize({
    settings: { environment: "development", oauth: [] },
    tenant: {},
    user: signedIn ? { name: "Ada" } : undefined,
  })

const post = { number: 412, title: "Slack alerts", votesCount: 10, hasVoted: false }

const renderVote = (signedIn: boolean, onChange = jest.fn()) => {
  render(
    <FiderContext.Provider value={fiderAs(signedIn)}>
      <VoteButton post={post} onChange={onChange} />
    </FiderContext.Provider>
  )
  return { button: screen.getByRole("button"), onChange }
}

const deferred = <T,>() => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

describe("ui2 <VoteButton />", () => {
  test("counts the vote before the server answers, then keeps it", async () => {
    const answer = deferred<{ ok: boolean; data: { voted: boolean } }>()
    const post = jest.fn(() => answer.promise)
    http.post = post as unknown as typeof http.post
    const { button, onChange } = renderVote(true)

    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-pressed", "true")
    expect(button).toHaveTextContent("11")
    expect(onChange).toHaveBeenLastCalledWith(412, true, 11)
    expect(post).toHaveBeenCalledWith("/api/v1/posts/412/votes/toggle")

    answer.resolve({ ok: true, data: { voted: true } })
    await waitFor(() => expect(button).toHaveTextContent("11"))
    expect(button).toHaveAttribute("aria-pressed", "true")
  })

  test("reverts the count when the server refuses", async () => {
    http.post = jest.fn(() => Promise.resolve({ ok: false, data: {} })) as unknown as typeof http.post
    const { button, onChange } = renderVote(true)

    fireEvent.click(button)
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(412, false, 10))
    expect(button).toHaveTextContent("10")
    expect(button).toHaveAttribute("aria-pressed", "false")
  })

  test("the count pops only after a change", async () => {
    http.post = jest.fn(() => Promise.resolve({ ok: true, data: { voted: true } })) as unknown as typeof http.post
    const { button } = renderVote(true)
    const count = button.querySelector(".u2-vote__n") as HTMLElement
    expect(count.className).not.toContain("is-pop")
    fireEvent.click(button)
    await waitFor(() => expect(count.className).toContain("is-pop"))
    fireEvent.animationEnd(count)
    expect(count.className).not.toContain("is-pop")
  })

  test("signed-out visitors are sent to sign in, and nothing is posted", () => {
    const post = jest.fn()
    http.post = post as unknown as typeof http.post
    const goTo = jest.spyOn(navigator, "goTo").mockImplementation(() => undefined)
    const { button } = renderVote(false)

    fireEvent.click(button)
    expect(goTo).toHaveBeenCalledWith(expect.stringMatching(/^\/signin\?redirect=/))
    expect(post).not.toHaveBeenCalled()
    expect(button).toHaveTextContent("10")
    goTo.mockRestore()
  })
})
