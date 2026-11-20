import { Post, PostStatus, isClosedKind, StatusKind } from "@fider/models"
import { FiderImpl, timeAgo } from "@fider/services"

// Who may do what on an idea, the same rules as classic's PostDetails. These only
// decide which controls show: the server checks every one of them again.

const ONE_HOUR = 3600

const user = (fider: FiderImpl) => (fider.session.isAuthenticated ? fider.session.user : undefined)

export const isStaff = (fider: FiderImpl): boolean => !!user(fider)?.isCollaborator

// Staff any time; the author within an hour of posting.
export const canEditIdea = (fider: FiderImpl, post: Post): boolean => {
  const u = user(fider)
  if (!u) return false
  if (u.isCollaborator) return true
  return u.id === post.user.id && timeAgo(post.createdAt) <= ONE_HOUR
}

// Administrators only, and not once the idea is closed.
export const canDeleteIdea = (fider: FiderImpl, post: Post): boolean => {
  const u = user(fider)
  return !!u && u.isAdministrator && !PostStatus.Get(post.status).closed
}

// Staff either way; the author may only publish their own private idea, when the site allows it.
export const canTogglePrivacy = (fider: FiderImpl, post: Post): boolean => {
  const u = user(fider)
  if (!u) return false
  if (u.isCollaborator) return true
  return post.isPrivate && post.user?.id === u.id && !!fider.session.tenant.membersCanPublishPrivate
}

// The full voter list (with emails) is a team view.
export const canSeeVoters = (fider: FiderImpl): boolean => isStaff(fider)

export const canEditComment = (fider: FiderImpl, authorId: number): boolean => {
  const u = user(fider)
  return !!u && (u.isCollaborator || u.id === authorId)
}

// Votes are closed on closed ideas (built-in or a custom closed kind) and on locked sites.
export const canVote = (fider: FiderImpl, post: Post): boolean =>
  !fider.isReadOnly && !PostStatus.Get(post.status).closed && !(post.statusKind && isClosedKind(post.statusKind as StatusKind))

// "#merge=412" (from the board's Vora note or its M key) asks to merge this idea into #412;
// a bare "#merge" opens the merge dialog empty. Anything else is not a merge request.
export const mergeTarget = (hash: string): number | undefined | null => {
  const m = /^#merge(?:=(\d+))?$/.exec(hash)
  if (!m) return null
  return m[1] ? parseInt(m[1], 10) : undefined
}
