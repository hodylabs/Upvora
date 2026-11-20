import "./content.css"
import React from "react"
import { markdown } from "@fider/services"

interface MarkdownProps {
  text?: string
  // Inline for one-line text such as notification titles.
  inline?: boolean
  className?: string
}

// User Markdown only ever reaches the page through markdown.full, the same sanitized
// path classic uses (marked + DOMPurify with the site's allowed link schemes).
export const Markdown = ({ text, inline, className }: MarkdownProps) => {
  if (!text) return null
  const cls = ["u2-prose", inline && "u2-prose--inline", className].filter(Boolean).join(" ")
  return React.createElement(inline ? "span" : "div", { className: cls, dangerouslySetInnerHTML: { __html: markdown.full(text) } })
}
