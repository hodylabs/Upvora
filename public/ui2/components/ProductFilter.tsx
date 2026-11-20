import "./ui.css"

import React from "react"
import { i18n } from "@lingui/core"
import { Product } from "@fider/models"

// Toggle chips that filter a page by product (roadmap, scorecard). Hidden when the
// site has no products.
export const ProductFilter = (props: { products: Product[]; selected: number[]; onToggle: (id: number) => void }) => {
  if (props.products.length === 0) return null
  return (
    <div className="u2-pfilter" role="group" aria-label={i18n._({ id: "ui2.products.filter", message: "Filter by product" })}>
      {props.products.map((p) => (
        <button
          key={p.id}
          type="button"
          className="u2-chip u2-chip--product u2-pfilter__chip"
          aria-pressed={props.selected.includes(p.id)}
          style={p.color ? ({ "--u-chip-dot": p.color } as React.CSSProperties) : undefined}
          onClick={() => props.onToggle(p.id)}
        >
          {p.name}
        </button>
      ))}
    </div>
  )
}
