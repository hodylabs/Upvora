import "./ui.css"

import React from "react"
import { Trans, Plural } from "@lingui/react/macro"
import { RowChip } from "../lib/insights"
import { postHref } from "../lib/nav"

interface VoraNoteProps {
  chip: RowChip
  post: { number: number; slug: string }
  statusLabel: (slug: string) => string
}

// One Vora row note. Informational notes are chips; staff action notes are links
// styled as buttons (merge, ask for details).
export const VoraNote = (props: VoraNoteProps) => {
  const { chip, post } = props
  switch (chip.kind) {
    case "moved": {
      const from = props.statusLabel(chip.from)
      const to = props.statusLabel(chip.to)
      return (
        <span className="u2-chip u2-chip--moved" data-chip="moved">
          <Trans id="ui2.note.moved">
            {from} → {to} since you voted
          </Trans>
        </span>
      )
    }
    case "similar": {
      const count = chip.count
      return (
        <span className="u2-chip u2-chip--vora" data-chip="similar">
          <Plural id="ui2.note.similar" value={count} one="# similar" other="# similar" />
        </span>
      )
    }
    case "duplicate": {
      const of = chip.of
      // TODO(Stage 3): open the merge dialog prefilled instead of the idea page.
      return (
        <a className="u2-chip u2-chip--vora u2-chip--action" data-chip="duplicate" href={postHref(post, `#merge=${of}`)}>
          <Trans id="ui2.note.duplicate">Likely duplicate of #{of}</Trans>
        </a>
      )
    }
    case "needs_details":
      return (
        <a className="u2-chip u2-chip--vora u2-chip--action" data-chip="needs_details" href={postHref(post, "#comment")}>
          <Trans id="ui2.note.askdetails">Ask for details</Trans>
        </a>
      )
  }
}
