import "../../components/account/account.css"
import React from "react"
import { Markdown } from "../../components/content/Markdown"

// /terms and /privacy: the server's Markdown, through the same sanitized renderer as classic.
export interface LegalPageProps {
  content: string
}

const LegalPage = (props: LegalPageProps) => (
  <article className="u2-panel u2-legal">
    <Markdown text={props.content} />
  </article>
)

export default LegalPage
