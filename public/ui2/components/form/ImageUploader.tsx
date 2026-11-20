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

  const picked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const mine = ++op.current
    if (file.size > hardFileSizeLimit) {
      setTooBig(true)
      e.target.value = ""
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

  return (
    <div className="u2-upload">
      {preview && <img className="u2-upload__preview" src={preview} alt="" />}
      <input
        ref={fileRef}
        className="u2-upload__file"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={picked}
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
      {tooBig && (
        <span className="u2-fld__error" role="alert">
          {i18n._({ id: "ui2.upload.toobig", message: "The image size must be smaller than 5MB." })}
        </span>
      )}
    </div>
  )
}
