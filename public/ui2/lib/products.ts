import { Product } from "@fider/models"
import { replaceQuery } from "./nav"

// Product filter chips on the roadmap and scorecard pages keep classic's URLs:
// ?product=<slug> (from the product switcher) or ?products=<slug>,<slug>.
export const productIdsFromURL = (products: Product[], search: string): number[] => {
  const params = new URLSearchParams(search)
  const multi = params.get("products")
  const single = params.get("product")
  const slugs = multi ? multi.split(",") : single ? [single] : []
  return slugs.map((slug) => products.find((p) => p.slug === slug)?.id ?? 0).filter((id) => id > 0)
}

// Writes the chosen products back as ?products=a,b (or no query when none).
export const writeProductIds = (products: Product[], ids: number[]): void => {
  const slugs = ids.map((id) => products.find((p) => p.id === id)?.slug).filter(Boolean)
  replaceQuery(slugs.length ? `?products=${slugs.join(",")}` : "")
}

export const toggleId = (ids: number[], id: number): number[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
