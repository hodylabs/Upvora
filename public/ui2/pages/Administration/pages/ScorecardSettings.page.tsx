import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { ScorecardField } from "@fider/models"
import { actions, Failure } from "@fider/services"
import { useFider } from "@fider/hooks"
import { Button, Field, Form, Select, TextInput, Toggle } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"
import { ScorecardFields } from "../components/ScorecardFields"

// Scorecard settings: the feature switch, the auto-create trigger status, the five
// stages (names and descending thresholds; the server validates the order) and the
// field catalogue. Collaborators have full edit rights here, as classic.

interface ScorecardSettingsPageProps {
  fields?: ScorecardField[]
  usage?: { [key: string]: number }
}

// An empty threshold becomes 0, so the server's descending-order check gives a clear
// message instead of a "must be a number" failure.
export const toBand = (value: string) => {
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? 0 : n
}

const ScorecardSettingsPage = (props: ScorecardSettingsPageProps) => {
  const fider = useFider()
  const tenant = fider.session.tenant
  const canEdit = fider.session.user.isCollaborator
  const [isEnabled, setIsEnabled] = useState(tenant.isScorecardEnabled)
  const [bands, setBands] = useState({
    bandStrong: tenant.scorecardBandStrong,
    bandGood: tenant.scorecardBandGood,
    bandRefine: tenant.scorecardBandRefine,
    bandLow: tenant.scorecardBandLow,
  })
  const [labels, setLabels] = useState({
    bandStrongLabel: tenant.scorecardBandStrongLabel || "Strong Candidate",
    bandGoodLabel: tenant.scorecardBandGoodLabel || "Good Candidate",
    bandRefineLabel: tenant.scorecardBandRefineLabel || "Needs Refinement",
    bandLowLabel: tenant.scorecardBandLowLabel || "Low Priority",
    bandNoneLabel: tenant.scorecardBandNoneLabel || "Not Recommended",
  })
  const [triggerStatusSlug, setTrigger] = useState(tenant.scorecardTriggerStatusSlug ?? "")
  const [error, setError] = useState<Failure | undefined>()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const result = await actions.updateScorecardSettings({ isEnabled, ...bands, ...labels, triggerStatusSlug })
    setSaving(false)
    if (result.ok) {
      toast.success(i18n._({ id: "ui2.admin.scorecard.saved", message: "Scorecard settings saved." }))
      setError(undefined)
    } else {
      setError(result.error)
    }
  }

  const stages: [keyof typeof labels, keyof typeof bands | null, number][] = [
    ["bandStrongLabel", "bandStrong", 1],
    ["bandGoodLabel", "bandGood", 2],
    ["bandRefineLabel", "bandRefine", 3],
    ["bandLowLabel", "bandLow", 4],
    ["bandNoneLabel", null, 5],
  ]

  return (
    <AdminLayout
      name="scorecard-settings"
      title={<Trans id="ui2.admin.scorecard.title">Scorecard</Trans>}
      subtitle={<Trans id="ui2.admin.scorecard.sub">Feature toggle, scoring stages, and the field catalogue</Trans>}
    >
      <Form error={error} onSubmit={save}>
        <AdminSection>
          <Field
            name="isEnabled"
            label={<Trans id="ui2.admin.scorecard.enable">Enable scorecard</Trans>}
            hint={
              <Trans id="ui2.admin.scorecard.enablehint">
                When enabled, collaborators and administrators see a Scorecard page for reviewing and scoring ideas across the weighted dimensions you define.
                Visitors never see it.
              </Trans>
            }
            group
          >
            <Toggle
              checked={isEnabled}
              label={i18n._({ id: "ui2.admin.scorecard.enable", message: "Enable scorecard" })}
              hideLabel
              disabled={!canEdit}
              onChange={setIsEnabled}
            />
          </Field>
          <Select
            name="triggerStatusSlug"
            label={<Trans id="ui2.admin.scorecard.trigger">Auto-create trigger status</Trans>}
            value={triggerStatusSlug}
            disabled={!canEdit}
            onChange={setTrigger}
            options={[
              { value: "", label: i18n._({ id: "ui2.admin.scorecard.notrigger", message: "No auto-trigger: cards are created manually" }) },
              ...(tenant.statuses ?? []).filter((s) => s.isActive).map((s) => ({ value: s.slug, label: s.label })),
            ]}
            hint={
              <Trans id="ui2.admin.scorecard.triggerhint">
                When a post&apos;s status changes to this one, a scorecard is automatically created and linked to it. Change the list of statuses at{" "}
                <a href="/admin/statuses">Site Settings, Statuses</a>. Select &quot;No auto-trigger&quot; if you&apos;d rather create every scorecard by hand.
              </Trans>
            }
          />
        </AdminSection>

        <AdminSection
          title={<Trans id="ui2.admin.scorecard.stages">Stages</Trans>}
          lede={
            <Trans id="ui2.admin.scorecard.stageshint">
              Rename any stage; thresholds must be strictly descending. Stage 5 catches every scored card below stage 4; cards with no scores show as &quot;Not
              scored&quot;.
            </Trans>
          }
        >
          {stages.map(([labelKey, bandKey, n]) => (
            <React.Fragment key={labelKey}>
              <TextInput
                name={labelKey}
                label={
                  bandKey ? (
                    <Trans id="ui2.admin.scorecard.stagename">Stage {n} name</Trans>
                  ) : (
                    <Trans id="ui2.admin.scorecard.stage5name">Stage 5 name (scored, below stage 4)</Trans>
                  )
                }
                hint={bandKey ? undefined : <span className="u2-mono">&lt; {bands.bandLow}</span>}
                value={labels[labelKey]}
                disabled={!canEdit}
                onChange={(v) => setLabels({ ...labels, [labelKey]: v })}
              />
              {bandKey && (
                <TextInput
                  name={bandKey}
                  inputMode="numeric"
                  label={<Trans id="ui2.admin.scorecard.stagescore">Stage {n} score at least</Trans>}
                  value={String(bands[bandKey])}
                  disabled={!canEdit}
                  onChange={(v) => setBands({ ...bands, [bandKey]: toBand(v) })}
                />
              )}
            </React.Fragment>
          ))}
        </AdminSection>
        <div className="u2-actions">
          <Button type="submit" variant="primary" loading={saving} disabled={!canEdit}>
            <Trans id="action.save">Save</Trans>
          </Button>
        </div>
      </Form>
      <ScorecardFields fields={props.fields ?? []} usage={props.usage ?? {}} />
    </AdminLayout>
  )
}

export default ScorecardSettingsPage
