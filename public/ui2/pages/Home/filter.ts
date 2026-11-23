import { querystring } from "@fider/services"
import { SearchPostsParams } from "@fider/services/actions"

// The board's query state. Same URL params as classic, so links keep working:
// view, query, statuses, tags, products, myvotes, myposts, notags, limit.
// "view" is classic's sort, so the List / By stage switch rides on its own "layout" param.
export interface BoardFilter {
  query: string
  view: string
  layout: string // "" (list) or "stage"
  statuses: string[] // may include the staff-only "pending" and "private" pseudo statuses
  tags: string[]
  products: number[]
  myVotes: boolean
  myPosts: boolean
  noTags: boolean
  limit?: number
}

export const DEFAULT_LIMIT = 30

export const filterFromURL = (): BoardFilter => ({
  query: querystring.get("query"),
  view: querystring.get("view"),
  layout: querystring.get("layout") === "stage" ? "stage" : "",
  statuses: querystring.getArray("statuses"),
  tags: querystring.getArray("tags"),
  products: querystring
    .getArray("products")
    .map((v) => parseInt(v, 10))
    .filter((n) => n > 0),
  myVotes: querystring.get("myvotes") === "true",
  myPosts: querystring.get("myposts") === "true",
  noTags: querystring.get("notags") === "true",
  limit: querystring.getNumber("limit"),
})

export const filterToQuery = (f: BoardFilter): string =>
  querystring.stringify({
    statuses: f.statuses,
    tags: f.tags,
    products: f.products.map(String),
    myvotes: f.myVotes ? "true" : undefined,
    myposts: f.myPosts ? "true" : undefined,
    notags: f.noTags ? "true" : undefined,
    query: f.query.trim().toLowerCase(),
    view: f.view,
    layout: f.layout,
    limit: f.limit,
  })

// The search API call classic makes for the same filter.
export const searchParams = (f: BoardFilter, productId?: number): SearchPostsParams => ({
  query: f.query.trim().toLowerCase(),
  view: f.view || "trending",
  limit: f.limit,
  tags: f.tags,
  statuses: f.statuses.filter((s) => s !== "pending" && s !== "private"),
  myVotes: f.myVotes,
  myPosts: f.myPosts,
  noTags: f.noTags,
  moderation: f.statuses.includes("pending") ? "pending" : "",
  privateOnly: f.statuses.includes("private"),
  product: productId,
  products: f.products,
})
