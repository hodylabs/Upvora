// Small URL helpers shared by the new UI's pages.

export const postHref = (p: { number: number; slug: string }, hash = ""): string => `/posts/${p.number}/${p.slug}${hash}`

// The server sanitizes `redirect` (same-origin paths only) and returns there after sign in.
export const signInHref = (): string => `/signin?redirect=${encodeURIComponent(location.pathname + location.search)}`

// Pages that change the query string with history.replaceState fire this, so the
// shell's sidebar can update which view is current.
export const URL_CHANGE_EVENT = "ui2:urlchange"

export const replaceQuery = (qs: string): void => {
  history.replaceState(history.state, "", location.pathname + qs)
  window.dispatchEvent(new Event(URL_CHANGE_EVENT))
}
