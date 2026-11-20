import { Post, Status } from "@fider/models"

// One roadmap lane: a status with show-on-roadmap on (the server picks and orders
// them by sort order) and the posts loaded for it so far.
export interface Lane {
  status: Status
  posts: Post[]
  limit: number
}

// Must match the Limit the server's RoadmapPage handler sends: "Show more" appears
// when a lane got as many posts as it asked for.
export const LANE_LIMIT = 10
export const LANE_STEP = 10

export interface LaneFilter {
  products: number[]
  tag: string | null
  query: string
}

export const lanesFrom = (columns: { status: Status; posts: Post[] }[] | undefined): Lane[] =>
  (columns || []).map((c) => ({ status: c.status, posts: c.posts || [], limit: LANE_LIMIT }))

// Classic's filters: any chosen product, the one chosen tag, and the query in the
// title or description.
export const matches = (p: Post, f: LaneFilter): boolean => {
  if (f.products.length > 0 && !f.products.includes(p.product?.id ?? -1)) return false
  if (f.tag && !p.tags.includes(f.tag)) return false
  const q = f.query.trim().toLowerCase()
  if (q && !p.title.toLowerCase().includes(q) && !(p.description || "").toLowerCase().includes(q)) return false
  return true
}

export const visiblePosts = (lane: Lane, f: LaneFilter): Post[] => lane.posts.filter((p) => matches(p, f))

export const hasMore = (lane: Lane): boolean => lane.posts.length >= lane.limit

// Closed-completed lanes show the shipped date instead of the vote button, as classic.
export const isCompletedLane = (status: Status): boolean => status.kind === "closed-completed" || status.slug === "completed"

export const laneOf = (lanes: Lane[], postNumber: number): Lane | undefined => lanes.find((l) => l.posts.some((p) => p.number === postNumber))

// Moves a post to the top of another lane; unchanged when it is already there or
// either lane is unknown.
export const movePost = (lanes: Lane[], postNumber: number, toSlug: string): Lane[] => {
  const from = laneOf(lanes, postNumber)
  if (!from || from.status.slug === toSlug || !lanes.some((l) => l.status.slug === toSlug)) return lanes
  const post = from.posts.find((p) => p.number === postNumber) as Post
  const moved = { ...post, status: toSlug }
  return lanes.map((l) => {
    if (l === from) return { ...l, posts: l.posts.filter((p) => p.number !== postNumber) }
    if (l.status.slug === toSlug) return { ...l, posts: [moved, ...l.posts] }
    return l
  })
}

export const updatePost = (lanes: Lane[], postNumber: number, patch: Partial<Post>): Lane[] =>
  lanes.map((l) => ({ ...l, posts: l.posts.map((p) => (p.number === postNumber ? { ...p, ...patch } : p)) }))
