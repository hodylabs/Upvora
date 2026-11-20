import React from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Menu } from "../../components/Menu"

export interface MoveTarget {
  slug: string
  label: string
}

// The keyboard way to move an idea between lanes (staff): a "Move to…" button on the
// tile opens a menu of the other lanes.
export const MoveMenu = (props: { title: string; targets: MoveTarget[]; onMove: (slug: string) => void }) => (
  <Menu
    className="u2-move"
    triggerClassName="u2-move__btn"
    listClassName="u2-move__list u2-panel"
    triggerLabel={i18n._({ id: "ui2.roadmap.moveto.label", message: "Move {title} to another lane", values: { title: props.title } })}
    trigger={<Trans id="ui2.roadmap.moveto">Move to…</Trans>}
    items={props.targets.map((t) => ({ key: t.slug, label: t.label, onSelect: () => props.onMove(t.slug) }))}
  />
)
