import "./ui.css"

import React from "react"
import { ProductInfo } from "@fider/models"

export const ProductChip = (props: { product: ProductInfo }) => (
  <a
    className="u2-chip u2-chip--product"
    href={`/p/${props.product.slug}`}
    style={props.product.color ? ({ "--u-chip-dot": props.product.color } as React.CSSProperties) : undefined}
  >
    {props.product.name}
  </a>
)
