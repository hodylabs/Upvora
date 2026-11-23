import "../../components/account/account.css"
import React, { useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure, navigator } from "@fider/services"
import { useFider } from "@fider/hooks"
import { ImageUpload, UserAvatarType, UserSettings } from "@fider/models"
import { Button, Field, Form, ImageUploader, RadioGroup, Select, TextInput, Toggle } from "../../components/form"
import { ConfirmDialog, Modal, toast } from "../../components/feedback"
import { applyTheme, storedTheme, ThemeChoice } from "../../lib/theme"

// My settings: everything classic's MySettings page has (email change, name, avatar,
// notification settings per event and channel, API key for staff, delete account),
// plus the light/dark/system theme choice classic offers in its header.

interface MySettingsPageProps {
  userSettings: UserSettings
}

export const WEB = 1
export const EMAIL = 2

const EVENTS = [
  { key: "event_notification_new_post", label: () => i18n._({ id: "mysettings.notification.event.newpost", message: "New Post" }) },
  { key: "event_notification_new_comment", label: () => i18n._({ id: "mysettings.notification.event.discussion", message: "New Comments" }) },
  { key: "event_notification_mention", label: () => i18n._({ id: "mysettings.notification.event.mention", message: "Mentions" }) },
  { key: "event_notification_change_status", label: () => i18n._({ id: "mysettings.notification.event.statuschanged", message: "Status Changed" }) },
]

// Settings hold a bit mask per event (1 = web, 2 = email) as a string, as the server expects.
export const isOn = (settings: UserSettings, key: string, channel: number) => key in settings && (parseInt(settings[key], 10) & channel) > 0

export const toggleChannel = (settings: UserSettings, key: string, channel: number): UserSettings => ({
  ...settings,
  [key]: ((parseInt(settings[key], 10) || 0) ^ channel).toString(),
})

const ProfileSection = (props: MySettingsPageProps) => {
  const fider = useFider()
  const user = fider.session.user
  const [name, setName] = useState(user.name)
  const [avatarType, setAvatarType] = useState<UserAvatarType>(user.avatarType)
  const [avatar, setAvatar] = useState<ImageUpload | undefined>()
  const [settings, setSettings] = useState<UserSettings>(props.userSettings || {})
  const [changingEmail, setChangingEmail] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailSentTo, setEmailSentTo] = useState("")
  const [error, setError] = useState<Failure | undefined>()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const result = await actions.updateUserSettings({ name, avatarType, avatar, settings })
    if (result.ok) {
      location.reload()
      return
    }
    setSaving(false)
    setError(result.error)
  }

  const [emailBusy, setEmailBusy] = useState(false)
  // A ref, not state: a held Enter fires again before the re-render.
  const emailBusyRef = useRef(false)

  const submitNewEmail = async () => {
    if (emailBusyRef.current) return
    emailBusyRef.current = true
    setEmailBusy(true)
    try {
      const result = await actions.changeUserEmail(newEmail)
      if (result.ok) {
        setError(undefined)
        setChangingEmail(false)
        setEmailSentTo(newEmail)
      } else {
        setError(result.error)
      }
    } finally {
      emailBusyRef.current = false
      setEmailBusy(false)
    }
  }

  const cancelEmail = () => {
    setChangingEmail(false)
    setNewEmail("")
    setError(undefined)
  }

  const web = i18n._({ id: "mysettings.notification.channelweb", message: "Web" })
  const email = i18n._({ id: "mysettings.notification.channelemail", message: "Email" })

  return (
    <section className="u2-section" aria-labelledby="u2-set-profile">
      <h2 id="u2-set-profile" className="u2-section__title">
        <Trans id="ui2.settings.profile">Profile</Trans>
      </h2>
      <Form error={error} onSubmit={save}>
        <TextInput
          name="email"
          type="email"
          label={i18n._({ id: "label.email", message: "Email" })}
          autoComplete="email"
          maxLength={200}
          disabled={!changingEmail}
          value={changingEmail ? newEmail : user.email || ""}
          onChange={setNewEmail}
          onKeyDown={(e) => {
            // Enter confirms the new email instead of saving the whole profile.
            if (e.key === "Enter") {
              e.preventDefault()
              submitNewEmail()
            }
          }}
          hint={
            user.email || changingEmail ? (
              <Trans id="mysettings.message.privateemail">Your email is private and will never be publicly displayed.</Trans>
            ) : (
              <Trans id="mysettings.message.noemail">Your account doesn&apos;t have an email.</Trans>
            )
          }
          after={
            <div className="u2-row">
              {changingEmail ? (
                <>
                  <Button small variant="primary" loading={emailBusy} onClick={submitNewEmail}>
                    <Trans id="action.confirm">Confirm</Trans>
                  </Button>
                  <Button small variant="ghost" onClick={cancelEmail}>
                    <Trans id="action.cancel">Cancel</Trans>
                  </Button>
                </>
              ) : (
                <Button small onClick={() => setChangingEmail(true)}>
                  <Trans id="ui2.settings.changeemail">Change email</Trans>
                </Button>
              )}
            </div>
          }
        />
        <TextInput name="name" label={i18n._({ id: "label.name", message: "Name" })} autoComplete="name" maxLength={100} value={name} onChange={setName} />
        <Select
          name="avatarType"
          label={i18n._({ id: "label.avatar", message: "Avatar" })}
          value={avatarType}
          onChange={(v) => setAvatarType(v as UserAvatarType)}
          options={[
            { label: i18n._({ id: "label.letter", message: "Letter" }), value: UserAvatarType.Letter },
            { label: i18n._({ id: "label.gravatar", message: "Gravatar" }), value: UserAvatarType.Gravatar },
            { label: i18n._({ id: "label.custom", message: "Custom" }), value: UserAvatarType.Custom },
          ]}
          hint={
            avatarType === UserAvatarType.Gravatar ? (
              <Trans id="mysettings.message.avatar.gravatar">
                A{" "}
                <a className="text-link" rel="noopener" href="https://en.gravatar.com" target="_blank">
                  Gravatar
                </a>{" "}
                will be used based on your email. If you don&apos;t have a Gravatar, a letter avatar based on your initials is generated for you.
              </Trans>
            ) : avatarType === UserAvatarType.Letter ? (
              <Trans id="mysettings.message.avatar.letter">A letter avatar based on your initials is generated for you.</Trans>
            ) : (
              <Trans id="mysettings.message.avatar.custom">
                We accept JPG, GIF and PNG images, smaller than 100KB and with an aspect ratio of 1:1 with minimum dimensions of 50x50 pixels.
              </Trans>
            )
          }
        />
        {avatarType === UserAvatarType.Custom && (
          <Field name="avatar" label={<Trans id="ui2.settings.avatarimage">Avatar image</Trans>} group>
            {(a) => <ImageUploader bkey={user.avatarBlobKey} describedBy={a["aria-describedby"]} onChange={setAvatar} />}
          </Field>
        )}
        <Field
          label={i18n._({ id: "label.notifications", message: "Notifications" })}
          hint={<Trans id="mysettings.notification.title">Choose the events to receive a notification for.</Trans>}
          group
        >
          <table className="u2-notif">
            <thead>
              <tr>
                <th scope="col">
                  <span className="u2-vh">
                    <Trans id="ui2.settings.event">Event</Trans>
                  </span>
                </th>
                <th scope="col" className="u2-notif__ch">
                  {web}
                </th>
                <th scope="col" className="u2-notif__ch">
                  {email}
                </th>
              </tr>
            </thead>
            <tbody>
              {EVENTS.map((ev) => (
                <tr key={ev.key}>
                  <th scope="row">{ev.label()}</th>
                  {[WEB, EMAIL].map((ch) => (
                    <td key={ch}>
                      <Toggle
                        hideLabel
                        label={`${ev.label()}: ${ch === WEB ? web : email}`}
                        checked={isOn(settings, ev.key, ch)}
                        onChange={() => setSettings((s) => toggleChannel(s, ev.key, ch))}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Field>
        <div className="u2-actions">
          <Button type="submit" variant="primary" loading={saving}>
            <Trans id="action.save">Save</Trans>
          </Button>
        </div>
      </Form>

      <Modal
        open={!!emailSentTo}
        onClose={() => setEmailSentTo("")}
        title={<Trans id="modal.changeemail.header">Confirm your new email</Trans>}
        footer={
          <Button variant="primary" onClick={() => setEmailSentTo("")}>
            <Trans id="action.ok">OK</Trans>
          </Button>
        }
      >
        <p>
          <Trans id="ui2.settings.changeemail.sent">
            We have just sent a confirmation link to <b>{emailSentTo}</b>. Click the link to update your email.
          </Trans>
        </p>
      </Modal>
    </section>
  )
}

const ThemeSection = () => {
  const fider = useFider()
  const [theme, setTheme] = useState<ThemeChoice>(() => storedTheme(fider.session.tenant.defaultTheme))
  const choose = (t: ThemeChoice) => {
    setTheme(t)
    applyTheme(t)
  }
  return (
    <section className="u2-section" aria-labelledby="u2-set-theme">
      <h2 id="u2-set-theme" className="u2-section__title">
        <Trans id="ui2.settings.theme">Theme</Trans>
      </h2>
      <p className="u2-section__lede">
        <Trans id="ui2.settings.theme.lede">Applies right away, on this browser.</Trans>
      </p>
      <RadioGroup
        name="theme"
        cards
        legend={i18n._({ id: "ui2.settings.theme", message: "Theme" })}
        value={theme}
        onChange={choose}
        options={[
          { value: "light", label: <Trans id="ui2.settings.theme.light">Light</Trans> },
          { value: "dark", label: <Trans id="ui2.settings.theme.dark">Dark</Trans> },
          {
            value: "system",
            label: <Trans id="ui2.settings.theme.system">System</Trans>,
            hint: <Trans id="ui2.settings.theme.system.hint">Follows your device</Trans>,
          },
        ]}
      />
    </section>
  )
}

const APIKeySection = () => {
  const [apiKey, setApiKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const regenerate = async () => {
    setBusy(true)
    const result = await actions.regenerateAPIKey()
    setBusy(false)
    setConfirming(false)
    if (result.ok) setApiKey(result.data.apiKey)
  }
  return (
    <section className="u2-section" aria-labelledby="u2-set-api">
      <h2 id="u2-set-api" className="u2-section__title">
        <Trans id="mysettings.apikey.title">API Key</Trans>
      </h2>
      <p className="u2-section__lede">
        <Trans id="mysettings.apikey.notice">
          The API Key is only shown whenever generated. If your Key is lost or has been compromised, generated a new one and take note of it.
        </Trans>{" "}
        <Trans id="mysettings.apikey.documentation">
          To learn how to use the API, read the{" "}
          <a className="text-link" rel="noopener" href="https://docs.fider.io/api" target="_blank">
            official documentation
          </a>
          .
        </Trans>
      </p>
      <Button small onClick={() => setConfirming(true)} loading={busy}>
        <Trans id="mysettings.apikey.generate">Regenerate API Key</Trans>
      </Button>
      <ConfirmDialog
        open={confirming}
        danger
        title={<Trans id="ui2.settings.apikey.confirmtitle">Regenerate your API key?</Trans>}
        confirmLabel={<Trans id="mysettings.apikey.generate">Regenerate API Key</Trans>}
        onCancel={() => setConfirming(false)}
        onConfirm={regenerate}
      >
        <Trans id="ui2.settings.apikey.confirmtext">
          Your current key stops working immediately. Anything that uses it will fail until you give it the new key.
        </Trans>
      </ConfirmDialog>
      {apiKey && (
        <div className="u2-apikey" role="status">
          <span>
            <Trans id="ui2.settings.apikey.new">Your new API key:</Trans>
          </span>
          <code data-testid="u2-apikey">{apiKey}</code>
          <span className="u2-muted">
            <Trans id="mysettings.apikey.newkeynotice">Store it securely on your servers and never store it in the client side of your app.</Trans>
          </span>
        </div>
      )}
    </section>
  )
}

const DeleteSection = () => {
  const [open, setOpen] = useState(false)
  const remove = async () => {
    const result = await actions.deleteCurrentAccount()
    if (result.ok) {
      navigator.goHome()
    } else {
      toast.error(i18n._({ id: "ui2.settings.delete.failed", message: "Failed to delete your account. Try again later." }))
    }
  }
  return (
    <section className="u2-section u2-section--danger" aria-labelledby="u2-set-delete">
      <h2 id="u2-set-delete" className="u2-section__title">
        <Trans id="mysettings.dangerzone.title">Delete account</Trans>
      </h2>
      <p className="u2-section__lede">
        <Trans id="mysettings.dangerzone.text">
          When you choose to delete your account, we will erase all your personal information forever. The content you have published will remain, but it will
          be anonymised.
        </Trans>{" "}
        <Trans id="mysettings.dangerzone.notice">This process is irreversible. Please be certain.</Trans>
      </p>
      <Button variant="danger" small onClick={() => setOpen(true)}>
        <Trans id="mysettings.dangerzone.delete">Delete My Account</Trans>
      </Button>
      <ConfirmDialog
        open={open}
        danger
        title={<Trans id="modal.deleteaccount.header">Delete account</Trans>}
        confirmLabel={<Trans id="mysettings.dangerzone.delete">Delete My Account</Trans>}
        onConfirm={remove}
        onCancel={() => setOpen(false)}
      >
        <p>
          <Trans id="ui2.settings.delete.confirm">
            We will erase all your personal information forever. The content you have published will remain, but it will be anonymised. This cannot be undone.
          </Trans>
        </p>
      </ConfirmDialog>
    </section>
  )
}

const MySettingsPage = (props: MySettingsPageProps) => {
  const fider = useFider()
  return (
    <div className="u2-page">
      <header className="u2-page__head">
        <h1 className="u2-page__title">
          <Trans id="mysettings.page.title">Settings</Trans>
        </h1>
        <p className="u2-page__sub">
          <Trans id="mysettings.page.subtitle">Manage your profile settings</Trans>
        </p>
      </header>
      <div className="u2-panel u2-settings">
        <ProfileSection userSettings={props.userSettings} />
        <ThemeSection />
        {fider.session.user.isCollaborator && <APIKeySection />}
        <DeleteSection />
      </div>
    </div>
  )
}

export default MySettingsPage
