import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { actions, Fider } from "@fider/services"
import { Field, Toggle } from "../../components/form"
import { toast } from "../../components/feedback"

export type SubmissionField = "voraRequired" | "voraBypassAdmins" | "voraBypassCollaborators" | "fileAttachmentsEnabled"

interface SubmissionToggleProps {
  field: SubmissionField
  label: string
  hint?: React.ReactNode
  onChange?: (value: boolean) => void
}

// Classic's SubmissionToggle: saves one idea-submission switch as soon as it changes
// (the server leaves the others as they are). A failed save flips it back; the http
// layer already shows the error. Read-only for collaborators.
export const SubmissionToggle = (props: SubmissionToggleProps) => {
  const [active, setActive] = useState(!!Fider.session.tenant[props.field])
  const [saving, setSaving] = useState(false)

  const change = async (value: boolean) => {
    setSaving(true)
    setActive(value)
    const result = await actions.updateSubmissionSettings({ [props.field]: value })
    setSaving(false)
    if (result.ok) {
      Fider.session.tenant[props.field] = value
      props.onChange?.(value)
      toast.success(i18n._({ id: "ui2.admin.saved", message: "Saved." }))
    } else {
      setActive(!value)
    }
  }

  return (
    <Field label={props.label} hint={props.hint} group>
      <Toggle checked={active} label={props.label} hideLabel disabled={saving || !Fider.session.user.isAdministrator} onChange={change} />
    </Field>
  )
}
