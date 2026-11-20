import "./form.css"
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { Editor, EditorContent, JSONContent, useEditor, useEditorState } from "@tiptap/react"
import Link from "@tiptap/extension-link"
import { Placeholder } from "@tiptap/extensions"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { fileToBase64 } from "@fider/services"
import { generateBkey } from "@fider/services/bkey"
import { isValidUrl, normalizeUrl } from "@fider/services/url"
import { useAllowedProtocols, useAllowedSchemesRegex } from "@fider/hooks"
import { ImageUpload } from "@fider/models"
import { CustomImage } from "./editor/CustomImage"
import { CustomMention } from "./editor/CustomMention"
import { fiderMarkdown } from "./editor/FiderMarkdown"
import { fiderStarterKit } from "./editor/FiderStarterKit"
import { RawMarkdown } from "./editor/RawMarkdown"
import { mentionSuggestion } from "./editor/mentions"
import { useFormContext } from "./Form"
import { Modal } from "../feedback/Modal"
import { toast } from "../feedback/toast"
import { Button } from "./Button"
import { Form } from "./Form"
import { TextInput } from "./TextInput"

// The new UI's rich Markdown editor. Behavior follows classic's CommentEditor
// (public/components/common/form/CommentEditor.tsx): the same tiptap schema and Markdown
// serialization (the copied extensions in ./editor), @mentions, pasted and picked images
// sent as ImageUpload with a client bkey, a raw Markdown mode, Ctrl/Cmd+K for links,
// and the length counter. Editor-generated classes styled in form.css (PurgeCSS keeps
// them because they are named here, space separated): ProseMirror mention tiptap-is-empty c-editor-raw-markdown aria-pressed aria-selected

export interface MarkdownEditorProps {
  // Server error field (e.g. "description"); errors show under the editor.
  field: string
  // Accessible name of the editing area.
  label: string
  initialValue: string | null
  placeholder?: string
  disabled?: boolean
  onChange?: (markdown: string) => void
  onFocus?: () => void
  // Called with each removed image (remove: true) and each added or restored one (remove: false,
  // with the upload for an image added in this session).
  onImageUploaded?: (upload: ImageUpload) => void
  // Base64 content of an image held by the parent (a restored draft), by bkey.
  onGetImageSrc?: (bkey: string) => string
  // The full pending upload the parent holds for a bkey (a restored draft), so an image
  // removed and then restored is sent again with its bytes.
  onGetUpload?: (bkey: string) => ImageUpload["upload"] | undefined
  maxAttachments?: number
  maxImageSizeKB?: number
  maxLength?: number
}

const DEFAULT_MAX_LENGTH = 4000

const imageBkeys = (editor: Editor): Set<string> => {
  const keys = new Set<string>()
  editor.state.doc.descendants((node) => {
    if ((node.type.name === "customImage" || node.type.name === "image") && node.attrs.bkey) keys.add(node.attrs.bkey)
    return true
  })
  return keys
}

// Image keys in raw Markdown, through the editor's own Markdown parser, so raw mode counts
// exactly the images rich mode would (a title, a code block and so on are handled the same).
const rawImageBkeys = (editor: Editor | null, md: string): Set<string> => {
  const keys = new Set<string>()
  const walk = (node: JSONContent) => {
    if ((node.type === "customImage" || node.type === "image") && node.attrs?.bkey) keys.add(node.attrs.bkey)
    node.content?.forEach(walk)
  }
  if (editor?.markdown) walk(editor.markdown.parse(md))
  return keys
}

const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d={d} />
  </svg>
)

interface LinkDialogProps {
  open: boolean
  selectedText: string
  onClose: () => void
  onInsert: (text: string, url: string) => void
}

const LinkDialog = (props: LinkDialogProps) => {
  const [text, setText] = useState("")
  const [url, setUrl] = useState("")
  const [errors, setErrors] = useState<{ text?: string; url?: string }>({})
  const allowed = useAllowedSchemesRegex()
  const formId = useId()

  useEffect(() => {
    if (props.open) {
      setText(props.selectedText)
      setUrl("")
      setErrors({})
    }
  }, [props.open, props.selectedText])

  const submit = () => {
    const next: { text?: string; url?: string } = {}
    if (!text.trim()) next.text = i18n._({ id: "linkmodal.text.required", message: "Text is required" })
    if (!isValidUrl(url, allowed)) next.url = i18n._({ id: "linkmodal.url.invalid", message: "Please enter a valid URL or crypto address" })
    setErrors(next)
    if (next.text || next.url) return
    props.onInsert(text.trim(), normalizeUrl(url))
    props.onClose()
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={<Trans id="linkmodal.title">Insert Link</Trans>}
      footer={
        <>
          <Button variant="ghost" onClick={props.onClose}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            <Trans id="ui2.editor.link.insert">Insert link</Trans>
          </Button>
        </>
      }
    >
      <Form id={formId} onSubmit={submit}>
        <TextInput
          stacked
          name="text"
          label={i18n._({ id: "linkmodal.text.label", message: "Text to display" })}
          value={text}
          onChange={setText}
          errors={errors.text ? [errors.text] : undefined}
        />
        <TextInput
          stacked
          name="url"
          type="url"
          label={i18n._({ id: "linkmodal.url.label", message: "URL" })}
          value={url}
          onChange={setUrl}
          errors={errors.url ? [errors.url] : undefined}
        />
      </Form>
    </Modal>
  )
}

export const MarkdownEditor = (props: MarkdownEditorProps) => {
  const maxLength = props.maxLength ?? DEFAULT_MAX_LENGTH
  const { errorsFor, clearError, register } = useFormContext()
  const errId = useId()
  const [rawMode, setRawMode] = useState(false)
  const [rawText, setRawText] = useState(props.initialValue ?? "")
  const [length, setLength] = useState((props.initialValue ?? "").length)
  const [link, setLink] = useState<{ open: boolean; text: string }>({ open: false, text: "" })
  const allowedProtocols = useAllowedProtocols()
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => register(props.field), [props.field, register])

  // The editor is created once; its handlers read the latest props through refs.
  const propsRef = useRef(props)
  useLayoutEffect(() => {
    propsRef.current = props
  })
  const rawModeRef = useRef(rawMode)
  rawModeRef.current = rawMode
  const imagesRef = useRef<Set<string>>(new Set())
  // Upload payloads of images added in this session, by bkey (the Markdown only holds the bkey).
  // Kept after a removal so Undo can send the image again.
  const uploads = useRef<Map<string, NonNullable<ImageUpload["upload"]>>>(new Map())
  const initialContent = useRef(props.initialValue ?? "")

  // Reports every image that left the text (remove: true) and every one that came back or was
  // added (remove: false, with the upload when this session holds it; a stored image needs none).
  const reconcileImages = (now: Set<string>) => {
    const prev = imagesRef.current
    imagesRef.current = now
    prev.forEach((bkey) => {
      if (now.has(bkey)) return
      // Keep a draft upload's bytes before the parent drops them, for a later restore.
      const held = uploads.current.has(bkey) ? undefined : propsRef.current.onGetUpload?.(bkey)
      if (held?.content) uploads.current.set(bkey, held)
      propsRef.current.onImageUploaded?.({ bkey, remove: true })
    })
    now.forEach((bkey) => {
      if (!prev.has(bkey)) propsRef.current.onImageUploaded?.({ bkey, upload: uploads.current.get(bkey), remove: false })
    })
  }
  const syncImages = (editor: Editor) => reconcileImages(imageBkeys(editor))

  const validate = (file: File): string => {
    const maxKB = propsRef.current.maxImageSizeKB || 5 * 1024
    if (file.size > maxKB * 1024) {
      return i18n._({ id: "validation.custom.maximagesize", values: { kilobytes: maxKB }, message: "The image size must be smaller than {kilobytes}KB." })
    }
    // 0 means no room left (files may take every slot), not "no limit".
    const max = propsRef.current.maxAttachments
    if (max !== undefined && imagesRef.current.size >= max) {
      return i18n._({ id: "validation.custom.maxattachments", values: { number: max }, message: "A maximum of {number} attachments are allowed." })
    }
    return ""
  }

  const addImage = async (file: File) => {
    const problem = validate(file)
    if (problem) {
      toast.error(problem)
      return
    }
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    const content = await fileToBase64(file)
    // Another image may have landed during the read: check the limit again.
    const late = validate(file)
    if (late) {
      toast.error(late)
      return
    }
    // Switched to Markdown mode during the read: an insert would report the rich doc over the raw draft.
    if (ed.isDestroyed || rawModeRef.current) return
    const bkey = generateBkey(file.name)
    const dataUrl = `data:${file.type};base64,${content}`
    uploads.current.set(bkey, { fileName: file.name, content, contentType: file.type })
    const before = ed.state.doc
    // The update this insert triggers reports the new image through syncImages.
    ed.chain()
      .focus()
      .setImage({ src: dataUrl, alt: file.name, ...({ bkey } as Record<string, string>) })
      .run()
    // An unchanged doc means the insert was dropped: never register a blob the text does not reference.
    if (ed.state.doc === before) uploads.current.delete(bkey)
  }

  const editor = useEditor(
    {
      extensions: [
        ...fiderStarterKit(),
        Link.configure({
          openOnClick: true,
          autolink: true,
          defaultProtocol: "https",
          protocols: allowedProtocols,
          HTMLAttributes: { target: "_blank", rel: "noopener nofollow" },
        }),
        fiderMarkdown(),
        RawMarkdown,
        CustomMention.configure({ HTMLAttributes: { class: "mention" }, suggestion: mentionSuggestion }),
        CustomImage.configure({
          HTMLAttributes: {},
          allowBase64: true,
          onGetImageSrc: (bkey) => {
            const pending = uploads.current.get(bkey)
            if (pending) return `data:${pending.contentType};base64,${pending.content}`
            const cached = propsRef.current.onGetImageSrc?.(bkey)
            return cached ? "data:image/jpeg;base64," + cached : ""
          },
        }),
        Placeholder.configure({ placeholder: props.placeholder ?? "", emptyEditorClass: "tiptap-is-empty" }),
      ],
      content: initialContent.current,
      contentType: "markdown",
      editable: !props.disabled,
      onUpdate: ({ editor }) => {
        const md = editor.getMarkdown().trim()
        setLength(md.length)
        clearError(propsRef.current.field)
        propsRef.current.onChange?.(md)
        syncImages(editor)
      },
      onFocus: () => propsRef.current.onFocus?.(),
      editorProps: {
        attributes: { "aria-label": props.label, "aria-multiline": "true", role: "textbox" },
        handlePaste: (_view, event) => {
          const items = Array.from(event.clipboardData?.items || [])
          const file =
            Array.from(event.clipboardData?.files || []).find((f) => f.type.startsWith("image/")) || items.find((i) => i.type.startsWith("image/"))?.getAsFile()
          if (!file) return false
          event.preventDefault()
          addImage(file)
          return true
        },
        handleKeyDown: (view, event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
            event.preventDefault()
            const { from, to } = view.state.selection
            setLink({ open: true, text: view.state.doc.textBetween(from, to) })
            return true
          }
          return false
        },
      },
    },
    // Created once (see classic CommentEditor): recreating it would drop the paste handler's editor.
    []
  )
  const editorRef = useRef<Editor | null>(null)
  editorRef.current = editor

  useEffect(() => {
    if (editor) imagesRef.current = imageBkeys(editor)
  }, [editor])

  useEffect(() => {
    // No update event: in raw mode it would report the stale rich-text document over the raw draft.
    editor?.setEditable(!props.disabled, false)
  }, [editor, props.disabled])

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: !!e?.isActive("heading", { level: 2 }),
      h3: !!e?.isActive("heading", { level: 3 }),
      bold: !!e?.isActive("bold"),
      italic: !!e?.isActive("italic"),
      strike: !!e?.isActive("strike"),
      bulletList: !!e?.isActive("bulletList"),
      orderedList: !!e?.isActive("orderedList"),
      codeBlock: !!e?.isActive("codeBlock"),
      blockquote: !!e?.isActive("blockquote"),
    }),
  })

  const toggleMode = () => {
    if (!editor) return
    if (rawMode) {
      editor.commands.setContent(rawText, { emitUpdate: false, contentType: "markdown" })
      syncImages(editor) // the editor's parse is the authority on which images remain
    } else {
      setRawText(editor.getMarkdown().trim())
    }
    setRawMode(!rawMode)
  }

  const insertMention = () => {
    if (!editor) return
    const { from } = editor.state.selection
    const before = editor.state.doc.textBetween(Math.max(0, from - 1), from)
    editor
      .chain()
      .focus()
      .insertContent(from === 0 || before === " " || before === "\n" || before === "" ? "@" : " @")
      .run()
  }

  const insertLink = (text: string, href: string) => {
    editor
      ?.chain()
      .focus()
      .insertContent({ type: "text", text, marks: [{ type: "link", attrs: { href, target: "_blank", rel: "noopener nofollow" } }] })
      .unsetMark("link")
      .run()
  }

  const errors = errorsFor(props.field)
  const disabled = !!props.disabled || !editor
  const tool = (key: keyof NonNullable<typeof active>, label: string, run: () => void, glyph: React.ReactNode) => (
    <button type="button" className="u2-md__tool" aria-label={label} title={label} aria-pressed={!!active?.[key]} disabled={disabled} onClick={run}>
      {glyph}
    </button>
  )
  const action = (label: string, run: () => void, glyph: React.ReactNode) => (
    <button type="button" className="u2-md__tool" aria-label={label} title={label} disabled={disabled} onClick={run}>
      {glyph}
    </button>
  )
  // The tools are disabled until the editor exists.
  const chain = () => (editor as Editor).chain().focus()

  return (
    <div>
      <div className="u2-md" aria-invalid={errors.length ? true : undefined}>
        <div className="u2-md__bar" role="toolbar" aria-label={i18n._({ id: "ui2.editor.toolbar", message: "Formatting" })}>
          {!rawMode && (
            <>
              {tool("h2", i18n._({ id: "ui2.editor.h2", message: "Heading 2" }), () => chain().toggleHeading({ level: 2 }).run(), "H2")}
              {tool("h3", i18n._({ id: "ui2.editor.h3", message: "Heading 3" }), () => chain().toggleHeading({ level: 3 }).run(), "H3")}
              {tool("bold", i18n._({ id: "ui2.editor.bold", message: "Bold" }), () => chain().toggleBold().run(), <b>B</b>)}
              {tool("italic", i18n._({ id: "ui2.editor.italic", message: "Italic" }), () => chain().toggleItalic().run(), <i>I</i>)}
              {tool("strike", i18n._({ id: "ui2.editor.strike", message: "Strikethrough" }), () => chain().toggleStrike().run(), <s>S</s>)}
              {tool(
                "bulletList",
                i18n._({ id: "ui2.editor.bullets", message: "Bulleted list" }),
                () => chain().toggleBulletList().run(),
                <Icon d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" />
              )}
              {tool(
                "orderedList",
                i18n._({ id: "ui2.editor.numbers", message: "Numbered list" }),
                () => chain().toggleOrderedList().run(),
                <Icon d="M10 6h10M10 12h10M10 18h10M4 5l1-1v4M4 14h2l-2 3h2" />
              )}
              {tool(
                "codeBlock",
                i18n._({ id: "ui2.editor.code", message: "Code block" }),
                () => chain().toggleCodeBlock().run(),
                <Icon d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
              )}
              {tool(
                "blockquote",
                i18n._({ id: "ui2.editor.quote", message: "Quote" }),
                () => chain().toggleBlockquote().run(),
                <Icon d="M7 7h4v6H7zM13 7h4v6h-4zM7 13c0 2-1 3-2 4M13 13c0 2-1 3-2 4" />
              )}
              {action(i18n._({ id: "ui2.editor.mention", message: "Mention someone" }), insertMention, "@")}
              {action(
                i18n._({ id: "ui2.editor.image", message: "Insert image" }),
                () => fileRef.current?.click(),
                <Icon d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01" />
              )}
              {action(
                i18n._({ id: "ui2.editor.link", message: "Insert link" }),
                () => {
                  if (!editor) return
                  const { from, to } = editor.state.selection
                  setLink({ open: true, text: editor.state.doc.textBetween(from, to) })
                },
                <Icon d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="u2-upload__file"
                tabIndex={-1}
                aria-hidden="true"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (file) await addImage(file)
                  e.target.value = ""
                }}
              />
            </>
          )}
          <button type="button" className="u2-md__tool u2-md__mode" aria-pressed={rawMode} disabled={disabled} onClick={toggleMode}>
            {rawMode ? <Trans id="editor.richtextmode">Switch to rich text editor</Trans> : <Trans id="editor.markdownmode">Switch to markdown editor</Trans>}
          </button>
        </div>
        {rawMode ? (
          <textarea
            className="u2-md__raw"
            aria-label={props.label}
            aria-describedby={errors.length ? errId : undefined}
            value={rawText}
            maxLength={maxLength}
            placeholder={props.placeholder}
            disabled={props.disabled}
            onFocus={props.onFocus}
            onChange={(e) => {
              setRawText(e.target.value)
              setLength(e.target.value.length)
              clearError(props.field)
              props.onChange?.(e.target.value)
              reconcileImages(rawImageBkeys(editorRef.current, e.target.value))
            }}
            data-testid="u2-markdown-raw"
          />
        ) : (
          <EditorContent editor={editor} className="u2-md__content" data-testid="u2-markdown-rich" />
        )}
      </div>
      {length >= maxLength * 0.8 && (
        <div className={length > maxLength ? "u2-md__count u2-md__count--over" : "u2-md__count"} aria-live="polite">
          {length} / {maxLength}
        </div>
      )}
      {errors.length > 0 && (
        <div id={errId} className="u2-fld__error" role="alert">
          {errors.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}
      <LinkDialog open={link.open} selectedText={link.text} onClose={() => setLink({ open: false, text: "" })} onInsert={insertLink} />
    </div>
  )
}
