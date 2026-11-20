import React, { useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Fider } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Field, Toggle } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { AdminLayout } from "../AdminLayout"

// Privacy: each switch saves the whole settings object at once, as classic does.

export interface PrivacyState {
  isPrivate: boolean
  isFeedEnabled: boolean
  isModerationEnabled: boolean
  membersPrivateIdeas: boolean
  membersCanPublishPrivate: boolean
  isSignUpDisabled: boolean
}

// Classic's save queue, kept as is: saves run one at a time so the server applies
// them in click order; only the latest save may roll back, and only to the last
// settings the server accepted. A private board always has its feed off.
export const createPrivacySaver = (initial: PrivacyState, show: (s: PrivacyState) => void, onSaved: () => void) => {
  let state = initial
  let confirmed = initial
  let seq = 0
  let queue: Promise<void> = Promise.resolve()
  const set = (s: PrivacyState) => {
    state = s
    show(s)
  }
  return {
    update(patch: Partial<PrivacyState>): Promise<void> {
      const next = { ...state, ...patch }
      if (next.isPrivate) next.isFeedEnabled = false
      const mine = ++seq
      set(next)
      queue = queue.then(async () => {
        // A network error throws; treat it as a failed save so the queue keeps going.
        const response = await actions.updateTenantPrivacy(next).catch(() => ({ ok: false }))
        if (response.ok) {
          confirmed = next
          onSaved()
        } else if (mine === seq) {
          set(confirmed) // http already shows the error
        }
      })
      return queue
    },
  }
}

const fromTenant = (): PrivacyState => {
  const t = Fider.session.tenant
  return {
    isPrivate: t.isPrivate,
    isFeedEnabled: t.isFeedEnabled,
    isModerationEnabled: t.isModerationEnabled,
    membersPrivateIdeas: t.membersPrivateIdeas,
    membersCanPublishPrivate: t.membersCanPublishPrivate,
    isSignUpDisabled: t.isSignUpDisabled,
  }
}

const PrivacySettingsPage = () => {
  const fider = useFider()
  const [s, setS] = useState<PrivacyState>(fromTenant)
  const saver = useRef<ReturnType<typeof createPrivacySaver>>()
  if (!saver.current) {
    saver.current = createPrivacySaver(s, setS, () =>
      toast.success(i18n._({ id: "ui2.admin.privacy.saved", message: "Your privacy settings have been saved." }))
    )
  }
  const update = (patch: Partial<PrivacyState>) => saver.current?.update(patch)
  const ro = !fider.session.user.isAdministrator

  const row = (label: string, hint: React.ReactNode, checked: boolean, onChange: (v: boolean) => void, disabled = ro) => (
    <Field label={label} hint={hint} group>
      <Toggle checked={checked} label={label} hideLabel disabled={disabled} onChange={onChange} />
    </Field>
  )

  return (
    <AdminLayout
      name="privacy"
      title={<Trans id="ui2.admin.privacy.title">Privacy</Trans>}
      subtitle={<Trans id="ui2.admin.privacy.sub">Manage your site&apos;s privacy</Trans>}
    >
      {row(
        i18n._({ id: "ui2.admin.privacy.private", message: "Private Board" }),
        <Trans id="ui2.admin.privacy.privatehint">
          A private board prevents unauthenticated users from viewing or interacting with its content. When enabled, only already registered users, invited
          users and users from trusted OAuth providers will have access to this board. Disables the feed feature.
        </Trans>,
        s.isPrivate,
        (v) => update({ isPrivate: v })
      )}
      {row(
        i18n._({ id: "ui2.admin.privacy.signups", message: "Disable Sign-ups" }),
        <Trans id="ui2.admin.privacy.signupshint">
          Prevents visitors from creating a new account on their own. The board stays publicly visible. When enabled, only already registered users, invited
          users and users from trusted OAuth providers can sign in. Private boards always have sign-ups disabled.
        </Trans>,
        s.isPrivate || s.isSignUpDisabled,
        (v) => update({ isSignUpDisabled: v }),
        ro || s.isPrivate
      )}
      {row(
        i18n._({ id: "ui2.admin.privacy.feed", message: "ATOM Feed" }),
        <Trans id="ui2.admin.privacy.feedhint">
          This feature lets users access this board via a feed reader. When enabled, the board makes its posts and comments available using the ATOM format.
          Links to feeds and autodiscovery metadata are shown on the board.
        </Trans>,
        s.isFeedEnabled,
        (v) => update({ isFeedEnabled: v }),
        ro || s.isPrivate
      )}
      {fider.session.tenant.isPro &&
        row(
          i18n._({ id: "ui2.admin.privacy.moderation", message: "Content Moderation" }),
          <Trans id="ui2.admin.privacy.moderationhint">
            When enabled, new posts and comments will require approval from an administrator before being visible to other users. Content creators can see their
            own unmoderated content, but it will be hidden from other users until approved.
          </Trans>,
          s.isModerationEnabled,
          (v) => update({ isModerationEnabled: v })
        )}
      {row(
        i18n._({ id: "ui2.admin.privacy.memberprivate", message: "Member Private Ideas" }),
        <Trans id="ui2.admin.privacy.memberprivatehint">
          Lets members mark an idea private when they submit it. A private idea is visible only to its author, collaborators and administrators.
        </Trans>,
        s.membersPrivateIdeas,
        (v) => update({ membersPrivateIdeas: v })
      )}
      {row(
        i18n._({ id: "ui2.admin.privacy.publishprivate", message: "Members Can Publish Private Ideas" }),
        <Trans id="ui2.admin.privacy.publishprivatehint">
          Lets a member make their own private idea public later. Members can never make an already-submitted idea private.
        </Trans>,
        s.membersCanPublishPrivate,
        (v) => update({ membersCanPublishPrivate: v })
      )}
    </AdminLayout>
  )
}

export default PrivacySettingsPage
