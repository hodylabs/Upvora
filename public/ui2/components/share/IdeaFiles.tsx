import React, { useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { ImageUpload } from "@fider/models"
import { fileToBase64 } from "@fider/services"
import { Button } from "../form/Button"
import { Field } from "../form/Field"
import { MAX_ATTACHMENTS, MAX_FILE_BYTES, fileKind } from "./rules"

interface IdeaFilesProps {
  attachments: ImageUpload[]
  onChange: (upload: ImageUpload) => void
  disabled?: boolean
}

// PDF, text and Markdown files for a new idea, as classic's IdeaFilesEditor: new files
// travel in the same attachments list as images (3 in all, 5 MB each).
export const IdeaFiles = (props: IdeaFilesProps) => {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string>()
  const files = props.attachments.filter((a) => !a.remove && a.upload?.fileName && fileKind(a.upload.fileName))
  const full = props.attachments.filter((a) => !a.remove && a.upload).length >= MAX_ATTACHMENTS

  const picked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (full) return setError(i18n._({ id: "ideafiles.error.full", message: "An idea can have up to 3 attachments, images included." }))
    if (!fileKind(file.name)) return setError(i18n._({ id: "ideafiles.error.type", message: "Only PDF, .txt and .md files can be attached." }))
    if (file.size > MAX_FILE_BYTES) return setError(i18n._({ id: "ideafiles.error.size", message: "The file size must be smaller than 5MB." }))
    setError(undefined)
    let content: string
    try {
      content = await fileToBase64(file)
    } catch {
      return setError(i18n._({ id: "ideafiles.error.read", message: "This file could not be read." }))
    }
    props.onChange({ bkey: `pending-${Math.random().toString(36).slice(2)}`, upload: { fileName: file.name, content, contentType: file.type }, remove: false })
  }

  return (
    <Field stacked group label={<Trans id="ideafiles.label">Files</Trans>} hint={<Trans id="ideafiles.hint">Up to 3 attachments in total, 5 MB each.</Trans>}>
      {files.length > 0 && (
        <ul className="u2-share__files">
          {files.map((a) => (
            <li key={a.bkey} className="u2-share__file">
              <span>{a.upload?.fileName}</span>
              {!props.disabled && (
                <button
                  type="button"
                  className="u2-iconbtn"
                  aria-label={`${i18n._({ id: "ideafiles.remove", message: "Remove" })} ${a.upload?.fileName}`}
                  onClick={() => props.onChange({ bkey: a.bkey, remove: true })}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
        onChange={picked}
        aria-label={i18n._({ id: "ideafiles.attach.label", message: "Attach a file" })}
      />
      {!props.disabled && (
        <Button small disabled={full} onClick={() => input.current?.click()}>
          <Trans id="ideafiles.attach">Attach a PDF, text or Markdown file</Trans>
        </Button>
      )}
      {error && (
        <p className="u2-fld__error" role="alert">
          {error}
        </p>
      )}
    </Field>
  )
}
