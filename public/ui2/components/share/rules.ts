import { CurrentUser, Tenant } from "@fider/models"

// Who may use Vora and the plain form, for display only: the server decides
// (handlers.VoraRequiredFor checks the role, bypass switches and the product's agent,
// and the voraToken that finalize issued). Mirrors classic's ShareFeedback.
export interface VoraGate {
  // Vora can run here: AI is on and an enabled agent serves this product.
  available: boolean
  // The plain form only opens after Vora has drafted the idea.
  required: boolean
}

export const voraGate = (tenant: Tenant, user: CurrentUser | undefined, productId: number): VoraGate => {
  const serves = !!tenant.aiEnabled && !!tenant.aiAgents?.some((a) => a.productId === productId || a.productId === null)
  const bypass = (!!user?.isAdministrator && !!tenant.voraBypassAdmins) || (!!user?.isCollaborator && !user.isAdministrator && !!tenant.voraBypassCollaborators)
  return { available: !!user && serves, required: !!tenant.voraRequired && serves && !bypass }
}

// A sign-in redirect must stay on this site: a relative path, never "//host" or "/\host".
export const safeRedirect = (path: string): string => (/^\/(?![/\\])/.test(path) ? path : "/")

export const SHARE_FLAG = "share"

// Sign in, then come back to this page with ?share=1, which reopens "Share an idea".
export const shareSignInHref = (): string => {
  const params = new URLSearchParams(location.search)
  params.set(SHARE_FLAG, "1")
  return `/signin?redirect=${encodeURIComponent(safeRedirect(`${location.pathname}?${params.toString()}`))}`
}

// The draft keys classic uses, so a draft survives a switch between the two looks.
export const DRAFT_KEYS = {
  TITLE: "PostInput-Title",
  DESCRIPTION: "PostInput-Description",
  ATTACHMENT: "PostInput-Attachment",
  TAGS: "PostInput-Tags",
  POST_PENDING: "PostInput-PostPending",
} as const

// Session flags the idea page turns into a toast after the redirect (as classic).
export const CREATED_SUCCESS = "POST_CREATED_SUCCESS"
export const CREATED_MODERATION = "POST_CREATED_MODERATION"

// Classic only offers "Submit" once the title has ten characters or more.
export const titleLongEnough = (title: string): boolean => title.replace(/\s+/g, " ").trim().length > 9

// Classic's file rules (PDF, text and Markdown; 3 attachments in all, images included)
// live with the files editor; the server validates and scans every file again.
export { MAX_ATTACHMENTS, fileKind } from "../content/IdeaFiles"
