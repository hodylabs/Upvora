import "./content.css"

import React, { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { ImageUpload } from "@fider/models"
import { Fider, fileToBase64 } from "@fider/services"
import { Modal } from "../feedback/Modal"
import { Button } from "../form/Button"
import { Markdown } from "./Markdown"

// An idea's file attachments (PDF, .txt, .md), the same model as classic's IdeaFiles:
// keys under files/, served from /static/files/, opened in an in-board viewer.
// The PDF viewer (pdf.js in its own worker) loads only on a click; esbuild.config.js
// stubs "./PdfView" so it never reaches ssr.js.
const PdfView = lazy(() => import(/* webpackChunkName: "pdfview" */ "./PdfView"))

export type FileKind = "pdf" | "md" | "txt"

const HARD_LIMIT = 5 * 1024 * 1024
export const MAX_ATTACHMENTS = 3

export const fileKind = (name: string): FileKind | undefined => {
  const lower = name.toLowerCase()
  if (lower.endsWith(".pdf")) return "pdf"
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "md"
  if (lower.endsWith(".txt") || lower.endsWith(".text")) return "txt"
  return undefined
}

export const isFileKey = (bkey?: string): boolean => !!bkey && bkey.startsWith("files/")

export const fileURL = (bkey: string) => `${Fider.settings.baseURL}/static/files/${bkey}`

// files/<random>-<name> -> <name>
export const fileName = (bkey: string): string => {
  const base = bkey.substring(bkey.lastIndexOf("/") + 1)
  const dash = base.indexOf("-")
  return dash >= 0 ? base.substring(dash + 1) : base
}

const FileIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M14 3H6v18h12V7zM14 3v4h4M9 13h6M9 17h6" />
  </svg>
)

// The viewer: PDF drawn by pdf.js, Markdown through the sanitized renderer, text as text.
export const FileViewer = (props: { bkey: string; onClose: () => void }) => {
  const kind = fileKind(props.bkey)
  const url = fileURL(props.bkey)
  const [text, setText] = useState<string | undefined>(undefined)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (kind === "pdf") return
    let cancelled = false
    fetch(url, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
      .then((body) => !cancelled && setText(body))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [url, kind])

  const loading = (
    <p className="u2-muted" aria-busy="true">
      <Trans id="ui2.peek.loading">Loading…</Trans>
    </p>
  )

  return (
    <Modal
      open
      size="lg"
      onClose={props.onClose}
      title={fileName(props.bkey)}
      footer={
        <>
          <a className="u2-btn u2-btn--ghost" href={url} target="_blank" rel="noopener noreferrer">
            <Trans id="ideafiles.open.newtab">Open in a new tab</Trans>
          </a>
          <Button onClick={props.onClose}>
            <Trans id="action.close">Close</Trans>
          </Button>
        </>
      }
    >
      {kind === "pdf" ? (
        <Suspense fallback={loading}>
          <PdfView url={url} />
        </Suspense>
      ) : failed ? (
        <p className="u2-muted">
          <Trans id="ideafiles.load.failed">This file could not be loaded.</Trans>
        </p>
      ) : text === undefined ? (
        loading
      ) : kind === "md" ? (
        <Markdown text={text} />
      ) : (
        <pre className="u2-files__text">{text}</pre>
      )}
    </Modal>
  )
}

// The idea's files as chips; each opens the viewer.
export const IdeaFilesList = (props: { bkeys?: string[] }) => {
  const [open, setOpen] = useState<string | undefined>(undefined)
  const files = (props.bkeys || []).filter(isFileKey)
  if (files.length === 0) return null
  return (
    <>
      <ul className="u2-files">
        {files.map((bkey) => (
          <li key={bkey}>
            <button type="button" className="u2-chip u2-files__chip" onClick={() => setOpen(bkey)}>
              <FileIcon />
              {fileName(bkey)}
            </button>
          </li>
        ))}
      </ul>
      {open && <FileViewer bkey={open} onClose={() => setOpen(undefined)} />}
    </>
  )
}

interface IdeaFilesEditorProps {
  existing?: string[]
  attachments: ImageUpload[]
  onChange: (upload: ImageUpload) => void
  // false keeps removing existing files possible while the site switch is off.
  allowAdd?: boolean
  // Read-only site: list the files, no add or remove.
  disabled?: boolean
}

// Adds and removes files while editing; they travel in the same attachments list as
// images, and the server validates and scans every file.
export const IdeaFilesEditor = (props: IdeaFilesEditorProps) => {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | undefined>(undefined)
  const removed = new Set(props.attachments.filter((a) => a.remove && a.bkey).map((a) => a.bkey))
  const kept = (props.existing || []).filter((bkey) => isFileKey(bkey) && !removed.has(bkey))
  const pending = props.attachments.filter((a) => !a.remove && a.upload?.fileName && fileKind(a.upload.fileName))
  const used = (props.existing || []).filter((bkey) => !removed.has(bkey)).length + props.attachments.filter((a) => !a.remove && a.upload).length
  const full = used >= MAX_ATTACHMENTS
  const removeLabel = i18n._({ id: "ideafiles.remove", message: "Remove" })

  const picked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    if (full) return setError(i18n._({ id: "ideafiles.error.full", message: "An idea can have up to 3 attachments, images included." }))
    if (!fileKind(file.name)) return setError(i18n._({ id: "ideafiles.error.type", message: "Only PDF, .txt and .md files can be attached." }))
    if (file.size > HARD_LIMIT) return setError(i18n._({ id: "ideafiles.error.size", message: "The file size must be smaller than 5MB." }))
    setError(undefined)
    let content: string
    try {
      content = await fileToBase64(file)
    } catch {
      return setError(i18n._({ id: "ideafiles.error.read", message: "This file could not be read." }))
    }
    props.onChange({ bkey: `pending-${Math.random().toString(36).slice(2)}`, upload: { fileName: file.name, content, contentType: file.type }, remove: false })
  }

  const chip = (key: string, name: string) => (
    <li key={key} className="u2-chip u2-files__chip">
      <FileIcon />
      {name}
      {!props.disabled && (
        <button type="button" className="u2-iconbtn" aria-label={`${removeLabel}: ${name}`} onClick={() => props.onChange({ bkey: key, remove: true })}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </li>
  )

  return (
    <div className="u2-files__editor">
      {(kept.length > 0 || pending.length > 0) && (
        <ul className="u2-files">
          {kept.map((bkey) => chip(bkey, fileName(bkey)))}
          {pending.map((a) => chip(a.bkey as string, a.upload?.fileName || ""))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        className="u2-upload__file"
        tabIndex={-1}
        aria-hidden="true"
        accept=".pdf,.txt,.md,.markdown,application/pdf,text/plain,text/markdown"
        onChange={picked}
      />
      {props.allowAdd !== false && !props.disabled && (
        <Button small disabled={full} onClick={() => input.current?.click()}>
          <Trans id="ideafiles.attach">Attach a PDF, text or Markdown file</Trans>
        </Button>
      )}
      <p className="u2-muted u2-files__hint">
        <Trans id="ideafiles.hint">Up to 3 attachments in total, 5 MB each.</Trans>
      </p>
      {error && (
        <p className="u2-fld__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
