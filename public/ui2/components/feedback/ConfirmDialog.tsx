import React, { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Modal } from "./Modal"
import { Button } from "../form/Button"

interface ConfirmDialogProps {
  open: boolean
  title: React.ReactNode
  children: React.ReactNode
  confirmLabel?: React.ReactNode
  // Red confirm button, for things that cannot be undone.
  danger?: boolean
  // May be async; the dialog stays open and locked until it settles.
  onConfirm: () => void | Promise<void>
  onCancel: () => void
}

export const ConfirmDialog = (props: ConfirmDialogProps) => {
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    if (busy) return
    setBusy(true)
    try {
      await props.onConfirm()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onCancel}
      title={props.title}
      locked={busy}
      footer={
        <>
          <Button variant="ghost" onClick={props.onCancel} disabled={busy}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
          <Button variant={props.danger ? "danger-solid" : "primary"} onClick={confirm} loading={busy}>
            {props.confirmLabel || <Trans id="action.confirm">Confirm</Trans>}
          </Button>
        </>
      }
    >
      {props.children}
    </Modal>
  )
}
