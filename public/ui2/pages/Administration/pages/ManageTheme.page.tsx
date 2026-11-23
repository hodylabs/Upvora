import "../components/groupB.css"
import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Failure } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button, Field, Form } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"
import { ColorInput, isHex } from "../components/ColorInput"

// Theme: classic's brand color (Upvora orange or custom), default appearance
// (light, dark, match the visitor's system) and one accent per function (buttons,
// votes, links, header), each Brand or its own hex. Saving reloads to apply.

const SURFACES = (): { key: string; label: string; hint: string }[] => [
  {
    key: "buttons",
    label: i18n._({ id: "ui2.admin.theme.buttons", message: "Buttons & CTA" }),
    hint: i18n._({ id: "ui2.admin.theme.buttonshint", message: "Primary buttons, Share an Idea" }),
  },
  {
    key: "votes",
    label: i18n._({ id: "ui2.admin.theme.votes", message: "Vote controls" }),
    hint: i18n._({ id: "ui2.admin.theme.voteshint", message: "Voted state on vote blocks" }),
  },
  {
    key: "links",
    label: i18n._({ id: "ui2.admin.theme.links", message: "Links" }),
    hint: i18n._({ id: "ui2.admin.theme.linkshint", message: "Text links everywhere" }),
  },
  {
    key: "header",
    label: i18n._({ id: "ui2.admin.theme.header", message: "Header accent" }),
    hint: i18n._({ id: "ui2.admin.theme.headerhint", message: "Active-nav underline" }),
  },
]

// The request classic sends: empty primary means the built-in brand, and an accent
// left on Brand is simply absent.
export const themeRequest = (primaryMode: "default" | "custom", primary: string, accents: { [k: string]: string }, defaultTheme: string) => ({
  primary: primaryMode === "default" ? "" : primary,
  accents,
  defaultTheme,
})

const PREVIEW_TOKENS = ["--u-bg", "--u-glass", "--u-surface2", "--u-surface3", "--u-edge", "--u-accent", "--u-grad"]

// Swatches and samples in the current appearance, with the brand color being edited.
// Decorative: the controls below are what screen readers need.
export const ThemePreview = (props: { brand?: string }) => (
  <div
    className={props.brand ? "u2-themeprev" : "u2-themeprev is-default"}
    style={props.brand ? ({ "--u-accent": props.brand } as React.CSSProperties) : undefined}
    aria-hidden="true"
    data-testid="u2-themeprev"
  >
    <ul className="u2-themeprev__sw">
      {PREVIEW_TOKENS.map((t) => (
        <li key={t}>
          <span style={{ background: `var(${t})` }} />
          <code>{t.replace("--u-", "")}</code>
        </li>
      ))}
    </ul>
    <div className="u2-themeprev__demo">
      <span className="u2-btn u2-btn--primary">
        <Trans id="ui2.vora.share">Share an idea</Trans>
      </span>
      <span className="u2-btn">
        <Trans id="ui2.admin.theme.secondary">Secondary</Trans>
      </span>
      <span className="u2-themeprev__link">
        <Trans id="ui2.admin.theme.link">A link</Trans>
      </span>
      <span className="u2-themeprev__rings">
        <span className="u2-pill u2-pill--review" />
        <span className="u2-pill u2-pill--planned" />
        <span className="u2-pill u2-pill--progress" />
        <span className="u2-pill u2-pill--shipped" />
      </span>
    </div>
  </div>
)

const ManageThemePage = () => {
  const fider = useFider()
  const t = fider.session.tenant
  const isAdmin = fider.session.user.isAdministrator
  const [primaryMode, setPrimaryMode] = useState<"default" | "custom">(t.themePrimary ? "custom" : "default")
  const [primary, setPrimary] = useState(t.themePrimary || "#F97316")
  const [accents, setAccents] = useState<{ [k: string]: string }>({ ...(t.themeAccents ?? {}) })
  const [defaultTheme, setDefaultTheme] = useState(t.defaultTheme || "light")
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)

  const setAccent = (key: string, hex: string) =>
    setAccents((a) => {
      const next = { ...a }
      if (hex === "") delete next[key]
      else next[key] = hex
      return next
    })

  const save = async () => {
    setBusy(true)
    const result = await actions.updateTenantTheme(themeRequest(primaryMode, primary, accents, defaultTheme))
    if (result.ok) {
      toast.success(i18n._({ id: "ui2.admin.theme.saved", message: "Theme saved, reloading to apply." }))
      setTimeout(() => location.reload(), 600)
      return
    }
    setBusy(false)
    setError(result.error)
  }

  const modes: { value: string; label: string }[] = [
    { value: "light", label: i18n._({ id: "ui2.admin.theme.light", message: "Light" }) },
    { value: "dark", label: i18n._({ id: "ui2.admin.theme.dark", message: "Dark" }) },
    { value: "system", label: i18n._({ id: "ui2.admin.theme.system", message: "Match visitor's system" }) },
  ]

  return (
    <AdminLayout
      name="theme"
      title={<Trans id="ui2.admin.theme.title">Theme</Trans>}
      subtitle={<Trans id="ui2.admin.theme.sub">Colors as settings, not stylesheets: token overrides survive every redesign</Trans>}
    >
      <Form error={error} onSubmit={save}>
        <AdminSection title={<Trans id="ui2.admin.theme.preview">Preview</Trans>}>
          <ThemePreview brand={primaryMode === "custom" && isHex(primary) ? primary : undefined} />
        </AdminSection>
        <AdminSection>
          <Field
            name="primary"
            group
            label={<Trans id="ui2.admin.theme.brand">Brand color</Trans>}
            hint={
              <Trans id="ui2.admin.theme.brandhint">
                One color drives buttons, votes, glows, links, and eyebrows everywhere. Light and dark shades are derived automatically for both appearances.
              </Trans>
            }
          >
            <div className="u2-theme-row">
              <span className="u2-seg">
                <Button small aria-pressed={primaryMode === "default"} onClick={() => setPrimaryMode("default")}>
                  <Trans id="ui2.admin.theme.orange">Upvora orange (default)</Trans>
                </Button>
                <Button small aria-pressed={primaryMode === "custom"} onClick={() => setPrimaryMode("custom")}>
                  <Trans id="ui2.admin.theme.custom">Custom</Trans>
                </Button>
              </span>
              {primaryMode === "custom" && (
                <ColorInput label={i18n._({ id: "ui2.admin.theme.brand", message: "Brand color" })} value={primary} onChange={setPrimary} />
              )}
            </div>
          </Field>

          <Field
            name="defaultTheme"
            group
            label={<Trans id="ui2.admin.theme.appearance">Default appearance</Trans>}
            hint={<Trans id="ui2.admin.theme.appearancehint">What visitors see before they pick. Their own toggle always wins.</Trans>}
          >
            <span className="u2-seg">
              {modes.map((m) => (
                <Button key={m.value} small aria-pressed={defaultTheme === m.value} onClick={() => setDefaultTheme(m.value)}>
                  {m.label}
                </Button>
              ))}
            </span>
          </Field>

          <Field
            name="accents"
            group
            label={<Trans id="ui2.admin.theme.accents">Accents per function</Trans>}
            hint={<Trans id="ui2.admin.theme.accentshint">Leave everything on Brand, or point a surface at its own color.</Trans>}
          >
            {SURFACES().map((s) => {
              const value = accents[s.key] ?? ""
              return (
                <div key={s.key} className="u2-theme-row" data-surface={s.key}>
                  <strong>{s.label}</strong>
                  <span className="u2-seg">
                    <Button small aria-pressed={value === ""} onClick={() => setAccent(s.key, "")}>
                      <Trans id="ui2.admin.theme.branddefault">Brand (default)</Trans>
                    </Button>
                    <Button small aria-pressed={value !== ""} onClick={() => setAccent(s.key, value || "#3B82F6")}>
                      <Trans id="ui2.admin.theme.custom">Custom</Trans>
                    </Button>
                  </span>
                  {value !== "" && <ColorInput label={s.label} value={value} onChange={(hex) => setAccent(s.key, hex)} />}
                  <span className="u2-muted">{s.hint}</span>
                </div>
              )
            })}
          </Field>
          <p className="u2-admin__sub u2-theme__note">
            <Trans id="ui2.admin.theme.note">
              The theme writes CSS tokens on the page; the UI reads tokens, so your colors survive redesigns. Custom CSS (Advanced) still loads last and wins;
              keep it for structural tweaks. Product colors join the same system.
            </Trans>
          </p>
        </AdminSection>

        <div className="u2-actions">
          <Button type="submit" variant="primary" loading={busy} disabled={!isAdmin}>
            <Trans id="ui2.admin.theme.save">Save theme</Trans>
          </Button>
        </div>
      </Form>
    </AdminLayout>
  )
}

export default ManageThemePage
