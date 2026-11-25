// "Share an idea" hands off to the Vora conversation (built in Stage 4) through a
// window event. A handler claims it by calling event.preventDefault(); this returns
// false when nobody did, so the caller can fall back.
export const SHARE_IDEA_EVENT = "ui2:share-idea"

export interface ShareIdeaDetail {
  title: string
  // "form" opens on "Write it yourself" (the box's Enter); unset starts with Vora where it serves.
  mode?: "form"
  // What the board's inline card already chose, so the dialog starts from it.
  productId?: number
  isPrivate?: boolean
}

export const requestShare = (title: string, extra: Omit<ShareIdeaDetail, "title"> = {}): boolean => {
  const event = new CustomEvent<ShareIdeaDetail>(SHARE_IDEA_EVENT, { detail: { title, ...extra }, cancelable: true })
  return !window.dispatchEvent(event)
}
