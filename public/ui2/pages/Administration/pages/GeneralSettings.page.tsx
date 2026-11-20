import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure, Fider } from "@fider/services"
import { ImageUpload } from "@fider/models"
import { useFider } from "@fider/hooks"
import locales from "@locale/locales"
import { Button, Field, Form, ImageUploader, RadioGroup, Select, TextArea, TextInput } from "../../../components/form"
import { AdminLayout } from "../AdminLayout"
import { SubmissionToggle } from "../SubmissionToggle"

// General: every field classic has (title, welcome header and message, default for
// new ideas, share instructions, sidebar call to action, invitation, logo, custom
// domain, locale), the file attachments switch (saved on its own) and the Look.
// Collaborators can read it; inputs are disabled for them and the server rejects
// their saves anyway.

export type Look = "classic" | "new"

interface LookPickerProps {
  stored: Look
}

// The Look: two option cards, saved on its own and reloaded straight into the
// chosen look. One save at a time; a failed save puts the cards back on the stored
// look so the admin can retry.
export const LookPicker = (props: LookPickerProps) => {
  const [value, setValue] = useState<Look>(props.stored)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const choose = async (ui: Look) => {
    if (saving || ui === value) return
    setSaving(true)
    setFailed(false)
    setValue(ui)
    const result = await actions.updateTenantUI(ui).catch(() => ({ ok: false }))
    if (result.ok) {
      location.reload()
      return
    }
    setValue(props.stored)
    setFailed(true)
    setSaving(false)
  }

  return (
    <Field
      name="ui"
      group
      label={<Trans id="ui2.admin.general.look">Look</Trans>}
      hint={
        <Trans id="ui2.admin.general.lookhint">
          Applies to everyone on this site. Switching reloads the page in the other look; your data, links and sign-ins stay the same. Saved immediately.
        </Trans>
      }
      errors={failed ? [i18n._({ id: "ui2.admin.general.lookerror", message: "The look could not be changed. Please try again." })] : undefined}
    >
      <div className="u2-looks" aria-busy={saving || undefined}>
        <RadioGroup<Look>
          name="ui"
          cards
          legend={i18n._({ id: "ui2.admin.general.look", message: "Look" })}
          value={value}
          disabled={saving}
          onChange={choose}
          options={[
            {
              value: "new",
              label: (
                <span className="u2-look">
                  <span className="u2-look__sw u2-look__sw--new" aria-hidden="true" />
                  <span>
                    <b>
                      <Trans id="ui2.admin.general.looknew">Upvora</Trans>
                    </b>
                    <span className="u2-look__d">
                      <Trans id="ui2.admin.general.looknewd">Dense, with Vora built in</Trans>
                    </span>
                  </span>
                </span>
              ),
            },
            {
              value: "classic",
              label: (
                <span className="u2-look">
                  <span className="u2-look__sw u2-look__sw--classic" aria-hidden="true" />
                  <span>
                    <b>
                      <Trans id="ui2.admin.general.lookclassic">Classic</Trans>
                    </b>
                    <span className="u2-look__d">
                      <Trans id="ui2.admin.general.lookclassicd">The look you have today</Trans>
                    </span>
                  </span>
                </span>
              ),
            },
          ]}
        />
      </div>
    </Field>
  )
}

const GeneralSettingsPage = () => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const isAdmin = fider.session.user.isAdministrator
  const [title, setTitle] = useState(tenant.name)
  const [welcomeHeader, setWelcomeHeader] = useState(tenant.welcomeHeader)
  const [welcomeMessage, setWelcomeMessage] = useState(tenant.welcomeMessage)
  const [descriptionTemplate, setDescriptionTemplate] = useState(tenant.descriptionTemplate)
  const [shareIdeaInstructions, setShareIdeaInstructions] = useState(tenant.shareIdeaInstructions ?? "")
  const [railCtaHeading, setRailCtaHeading] = useState(tenant.railCtaHeading ?? "")
  const [railCtaText, setRailCtaText] = useState(tenant.railCtaText ?? "")
  const [railCtaButton, setRailCtaButton] = useState(tenant.railCtaButton ?? "")
  const [invitation, setInvitation] = useState(tenant.invitation)
  const [logo, setLogo] = useState<ImageUpload | undefined>(undefined)
  const [cname, setCNAME] = useState(tenant.cname)
  const [locale, setLocale] = useState(tenant.locale)
  const [error, setError] = useState<Failure | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  // Default appearance lives on Admin, Theme; the value still rides along on general saves.
  const defaultTheme = tenant.defaultTheme || "light"

  const save = async () => {
    setSaving(true)
    const result = await actions.updateTenantSettings({
      title,
      cname,
      welcomeMessage,
      welcomeHeader,
      descriptionTemplate,
      shareIdeaInstructions,
      railCtaHeading,
      railCtaText,
      railCtaButton,
      defaultTheme,
      invitation,
      logo,
      locale,
    })
    if (result.ok) {
      location.href = "/"
      return
    }
    setSaving(false)
    setError(result.error)
  }

  const isApex = cname.split(".").length <= 2
  const ro = !isAdmin

  return (
    <AdminLayout
      name="general"
      title={<Trans id="ui2.admin.general.title">General</Trans>}
      subtitle={<Trans id="ui2.admin.general.sub">Manage your site settings</Trans>}
    >
      <Form error={error} onSubmit={save}>
        <TextInput
          name="title"
          label={<Trans id="ui2.admin.general.boardtitle">Your board&apos;s title</Trans>}
          hint={<Trans id="ui2.admin.general.boardtitlehint">Keep it short and snappy. Your product / service name is usually best.</Trans>}
          maxLength={60}
          value={title}
          disabled={ro}
          onChange={setTitle}
        />
        <TextInput
          name="welcomeHeader"
          label={<Trans id="ui2.admin.general.welcomeheader">Welcome Header</Trans>}
          hint={
            <Trans id="ui2.admin.general.welcomeheaderhint">
              Large header text shown on the home page. Leave empty to hide. Wrap text with underscores (e.g., _highlighted_) to show it in the accent color.
            </Trans>
          }
          maxLength={100}
          value={welcomeHeader}
          disabled={ro}
          placeholder="Help us build the _best feedback platform_"
          onChange={setWelcomeHeader}
        />
        <TextArea
          name="welcomeMessage"
          label={<Trans id="ui2.admin.general.welcomemessage">Welcome Message</Trans>}
          hint={
            <Trans id="ui2.admin.general.welcomemessagehint">
              The message is shown on this site&apos;s home page. Use it to help visitors understand what this space is about and the importance of their
              feedback.
            </Trans>
          }
          value={welcomeMessage}
          disabled={ro}
          onChange={setWelcomeMessage}
        />
        <TextArea
          name="descriptionTemplate"
          label={<Trans id="ui2.admin.general.template">Default for New Ideas</Trans>}
          hint={<Trans id="ui2.admin.general.templatehint">If set, all new ideas submitted by users will use this text as the default description.</Trans>}
          value={descriptionTemplate}
          disabled={ro}
          onChange={setDescriptionTemplate}
        />
        <TextArea
          name="shareIdeaInstructions"
          label={<Trans id="ui2.admin.general.share">Share Your Idea instructions</Trans>}
          hint={
            <Trans id="ui2.admin.general.sharehint">
              Optional Markdown shown at the top of the &quot;Share your idea&quot; modal, right under the header. Guide submitters on what to include (context,
              screenshots, expected outcome, etc.).
            </Trans>
          }
          value={shareIdeaInstructions}
          disabled={ro}
          onChange={setShareIdeaInstructions}
        />
        <TextInput
          name="railCtaHeading"
          label={<Trans id="ui2.admin.general.ctaheading">Sidebar heading</Trans>}
          hint={<Trans id="ui2.admin.general.ctaheadinghint">Heading of the call-to-action box in the board sidebar. Leave empty to use the default.</Trans>}
          maxLength={60}
          value={railCtaHeading}
          disabled={ro}
          placeholder="Have an idea?"
          onChange={setRailCtaHeading}
        />
        <TextArea
          name="railCtaText"
          label={<Trans id="ui2.admin.general.ctatext">Sidebar text</Trans>}
          hint={<Trans id="ui2.admin.general.ctatexthint">Short description under the sidebar heading. Leave empty to use the default.</Trans>}
          value={railCtaText}
          disabled={ro}
          onChange={setRailCtaText}
        />
        <TextInput
          name="railCtaButton"
          label={<Trans id="ui2.admin.general.ctabutton">Sidebar button</Trans>}
          hint={<Trans id="ui2.admin.general.ctabuttonhint">Text for the sidebar button. Leave empty to hide the button entirely.</Trans>}
          maxLength={60}
          value={railCtaButton}
          disabled={ro}
          placeholder="Submit Your Idea"
          onChange={setRailCtaButton}
        />
        <TextInput
          name="invitation"
          label={<Trans id="ui2.admin.general.invitation">Invitation</Trans>}
          hint={
            <Trans id="ui2.admin.general.invitationhint">
              Placeholder text in the suggestion&apos;s box. It should invite your visitors into sharing their feedback.
            </Trans>
          }
          maxLength={60}
          value={invitation}
          disabled={ro}
          placeholder="Enter your suggestion here..."
          onChange={setInvitation}
        />
        <Field
          name="logo"
          group
          label={<Trans id="ui2.admin.general.logo">Your Logo</Trans>}
          hint={<Trans id="ui2.admin.general.logohint">JPG, GIF or PNG smaller than 100KB, minimum size 200x200 pixels.</Trans>}
        >
          {(a) => <ImageUploader bkey={tenant.logoBlobKey} describedBy={a["aria-describedby"]} disabled={ro} onChange={setLogo} />}
        </Field>
        {!Fider.isSingleHostMode() && (
          <TextInput
            name="cname"
            label={<Trans id="ui2.admin.general.cname">Custom Domain</Trans>}
            maxLength={100}
            placeholder="feedback.yourcompany.com"
            value={cname}
            disabled={ro}
            onChange={setCNAME}
            hint={
              cname ? (
                <>
                  <Trans id="ui2.admin.general.cnamedns">Enter the following record into your DNS zone records:</Trans>{" "}
                  <span className="u2-mono" data-testid="u2-dns">
                    <strong>{cname}</strong> {isApex ? "ALIAS" : "CNAME"}{" "}
                    <strong>
                      {tenant.subdomain}
                      {fider.settings.domain}
                    </strong>
                  </span>{" "}
                  <Trans id="ui2.admin.general.cnamewait">
                    Please note that it may take up to 72 hours for the change to take effect worldwide due to DNS propagation.
                  </Trans>
                </>
              ) : (
                <Trans id="ui2.admin.general.cnamehint">
                  Use custom domains to access this site via your own domain name <code>feedback.yourcompany.com</code>
                </Trans>
              )
            }
          />
        )}
        <Select
          name="locale"
          label={<Trans id="ui2.admin.general.locale">Locale</Trans>}
          value={locale}
          disabled={ro}
          onChange={(v) => setLocale(v || "en")}
          options={Object.entries(locales).map(([k, v]) => ({ value: k, label: v.text }))}
          hint={
            locale !== "en" ? (
              <>
                <Trans id="ui2.admin.general.localehint">
                  This language is translated by the Open Source community. If you find a mistake or would like to improve its quality, you can find the
                  translations on{" "}
                  <a target="_blank" rel="noopener" href="https://github.com/getfider/fider/tree/main/locale">
                    GitHub
                  </a>{" "}
                  and contribute with your own translations.
                </Trans>{" "}
                <Trans id="ui2.admin.general.localeadmin">Only public pages are translated. Internal and/or administrative pages will remain in English.</Trans>
              </>
            ) : undefined
          }
        />
        {isAdmin && <LookPicker stored={tenant.ui === "new" ? "new" : "classic"} />}
        <SubmissionToggle
          field="fileAttachmentsEnabled"
          label={i18n._({ id: "ui2.admin.general.attachments", message: "File attachments on ideas" })}
          hint={
            <Trans id="ui2.admin.general.attachmentshint">
              Lets people attach PDF, .txt and .md files to ideas, besides images: up to 3 attachments, 5 MB each, viewed inside the board. PDFs with scripts,
              embedded files, forms or encryption are refused. Saved immediately.
            </Trans>
          }
        />
        <div className="u2-actions">
          <Button type="submit" variant="primary" disabled={ro} loading={saving}>
            <Trans id="action.save">Save</Trans>
          </Button>
        </div>
      </Form>
    </AdminLayout>
  )
}

export default GeneralSettingsPage
