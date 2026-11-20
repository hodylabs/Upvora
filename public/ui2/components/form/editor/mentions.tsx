// The @mention picker for the ui2 MarkdownEditor. Same data and keys as classic's
// public/components/common/form/suggestion.ts + MentionList.tsx (copied in spirit, restyled):
// the site's taggable users are fetched once, filtered by prefix, Up/Down/Enter pick, Esc closes.
import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react"
import { ReactRenderer } from "@tiptap/react"
import { MentionNodeAttrs } from "@tiptap/extension-mention"
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion"
import { i18n } from "@lingui/core"
import { actions } from "@fider/services"

interface ListProps {
  items: MentionNodeAttrs[]
  command: (item: MentionNodeAttrs) => void
}

export interface MentionListHandle {
  onKeyDown: (args: { event: KeyboardEvent }) => boolean
}

export const MentionList = forwardRef<MentionListHandle, ListProps>((props, ref) => {
  const [selected, setSelected] = useState(0)
  useEffect(() => setSelected(0), [props.items])

  const pick = (index: number) => {
    const item = props.items[index]
    if (item) props.command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = props.items.length
      if (event.key === "ArrowUp" && n) {
        setSelected((selected + n - 1) % n)
        return true
      }
      if (event.key === "ArrowDown" && n) {
        setSelected((selected + 1) % n)
        return true
      }
      if (event.key === "Enter") {
        pick(selected)
        return true
      }
      return false
    },
  }))

  if (!props.items.length) {
    return <div className="u2-mentions__none">{i18n._({ id: "ui2.editor.mention.none", message: "No one found" })}</div>
  }
  return (
    <div role="listbox" aria-label={i18n._({ id: "ui2.editor.mention.list", message: "People to mention" })}>
      {props.items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={i === selected}
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pick(i)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
})
MentionList.displayName = "MentionList"

let cachedUsers: MentionNodeAttrs[] = []

// The tiptap suggestion config (items + popup renderer) for CustomMention.
export const mentionSuggestion = {
  items: async ({ query }: { query: string }): Promise<MentionNodeAttrs[]> => {
    if (cachedUsers.length === 0) {
      const result = await actions.getTaggableUsers("")
      if (result.ok) {
        cachedUsers = result.data.map((user, idx) => ({ id: idx.toString(), label: user.name }))
      }
    }
    return cachedUsers.filter((u) => u.label?.toLowerCase().startsWith(query.toLowerCase())).slice(0, 100)
  },
  render: () => {
    let renderer: ReactRenderer<MentionListHandle, ListProps> | undefined
    let box: HTMLDivElement | undefined

    const place = (props: SuggestionProps<MentionNodeAttrs>) => {
      const rect = props.clientRect?.()
      if (!box || !rect) return
      box.style.top = `${rect.bottom + window.scrollY}px`
      box.style.left = `${rect.left + window.scrollX}px`
    }
    const close = () => {
      box?.remove()
      box = undefined
      renderer?.destroy()
      renderer = undefined
    }

    return {
      onStart: (props: SuggestionProps<MentionNodeAttrs>) => {
        renderer = new ReactRenderer(MentionList, { props, editor: props.editor })
        box = document.createElement("div")
        box.className = "u2-mentions"
        box.appendChild(renderer.element)
        document.body.appendChild(box)
        place(props)
      },
      onUpdate: (props: SuggestionProps<MentionNodeAttrs>) => {
        renderer?.updateProps(props)
        place(props)
      },
      onKeyDown: (props: SuggestionKeyDownProps) => {
        if (props.event.key === "Escape") {
          close()
          return true
        }
        return renderer?.ref?.onKeyDown(props) || false
      },
      onExit: close,
    }
  },
}
