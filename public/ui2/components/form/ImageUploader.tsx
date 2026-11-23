import "./form.css"
import React, { useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { fileToBase64, uploadedImageURL } from "@fider/services"
import { ImageUpload } from "@fider/models"
import { Button } from "./Button"

// Same hard limit as classic's ImageUploader; the server enforces the real rules
// (type, size, dimensions) and answers with a field error.
const hardFileSizeLimit = 5 * 1024 * 1024

interface ImageUploaderProps {
  // The stored image, if any.
  bkey?: string
  // The field's hint/error ids, announced with the button.
  describedBy?: string
  disabled?: boolean
  onChange: (upload: ImageUpload, previewURL?: string) => void
}

// Encodes the picked file the way the API expects (same as classic's ImageUploader):
// { bkey, upload: { fileName, content: <base64 without the data: prefix>, contentType }, remove: false },
// and { bkey, remove: true } to drop the stored image.
export const encodeImage = async (file: File, bkey?: string): Promise<ImageUpload> => ({
  bkey,
  upload: { fileName: file.name, content: await fileToBase64(file), contentType: file.type },
  remove: false,
})

export const ImageUploader = (props: ImageUploaderProps) => {
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | undefined>(uploadedImageURL(props.bkey))
  const [tooBig, setTooBig] = useState(false)
  // Bumped on every pick and removal, so a file read that finishes late is ignored.
  const op = useRef(0)

  const [over, setOver] = useState(false)

  const use = async (file: File | undefined) => {
    if (!file) return
    const mine = ++op.current
    if (file.size > hardFileSizeLimit) {
      setTooBig(true)
      if (fileRef.current) fileRef.current.value = ""
      return
    }
    setTooBig(false)
    const upload = await encodeImage(file, props.bkey)
    if (mine !== op.current) return
    const url = `data:${file.type};base64,${upload.upload?.content}`
    setPreview(url)
    props.onChange(upload, url)
  }

  const remove = () => {
    op.current++
    if (fileRef.current) fileRef.current.value = ""
    setPreview(undefined)
    setTooBig(false)
    props.onChange({ bkey: props.bkey, remove: true })
  }

  // Dropping a file is a shortcut for the button; only images go through, like the picker's accept.
  const drop = (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (props.disabled) return
    use(Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/")))
  }

  return (
    <div
      className={over ? "u2-upload u2-upload--over" : "u2-upload"}
      onDragOver={(e) => {
        e.preventDefault()
        if (!props.disabled) setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      {preview && <img className="u2-upload__preview" src={preview} alt="" />}
      <input
        ref={fileRef}
        className="u2-upload__file"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => use(e.target.files?.[0])}
        data-testid="u2-image-file"
      />
      <Button small disabled={props.disabled} onClick={() => fileRef.current?.click()} aria-describedby={props.describedBy}>
        {preview ? <Trans id="ui2.upload.replace">Replace image</Trans> : <Trans id="ui2.upload.choose">Choose image</Trans>}
      </Button>
      {preview && (
        <Button small variant="ghost" disabled={props.disabled} onClick={remove}>
          <Trans id="ui2.upload.remove">Remove</Trans>
        </Button>
      )}
      <span className="u2-upload__drop" aria-hidden="true">
        <Trans id="ui2.upload.drop">or drop an image here</Trans>
      </span>
      {tooBig && (
        <span className="u2-fld__error" role="alert">
          {i18n._({ id: "ui2.upload.toobig", message: "The image size must be smaller than 5MB." })}
        </span>
      )}
    </div>
  )
}
