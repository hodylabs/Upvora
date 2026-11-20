// "Share an idea" hands off to the Vora conversation (built in Stage 4) through a
// window event. A handler claims it by calling event.preventDefault(); this returns
// false when nobody did, so the caller can fall back.
export const SHARE_IDEA_EVENT = "ui2:share-idea"

export interface ShareIdeaDetail {
  title: string
}

export const requestShare = (title: string): boolean => {
  const event = new CustomEvent<ShareIdeaDetail>(SHARE_IDEA_EVENT, { detail: { title }, cancelable: true })
  return !window.dispatchEvent(event)
}
