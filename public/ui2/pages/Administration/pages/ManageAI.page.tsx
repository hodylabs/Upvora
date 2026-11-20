import "../components/adminc.css"

import React, { useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Fider } from "@fider/services"
import { Button, Field, RadioGroup, TextArea, TextInput, Toggle } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"
import { SubmissionToggle } from "../SubmissionToggle"

// AI (Vora): classic's page in the new look. One master switch, the submission
// switches (Require Vora, and who may skip it), the provider with its model, the
// API key, web search, and Vora's description and instructions per product.
// Keys are write-only: the stored key is never sent to the page (only hasKey), the
// key field always starts empty, and an empty field leaves the stored key as it is
// (the server keeps it). Only a Custom provider's key can be revealed, on request,
// from an admin-only endpoint that refuses the hosted providers.

interface AgentConfig {
  id: number
  productId: number | null
  description: string
  instructions: string
  enabled: boolean
  webSearchEnabled: boolean
}

interface ManageAIPageProps {
  agents: AgentConfig[]
  enabled: boolean
  provider: string
  model: string
  customBaseUrl: string
  customModel: string
  hasKey: boolean
  webSearchEnabled: boolean
  webSearchProvider: string
  webSearchBaseUrl: string
  webSearchHasKey: boolean
}

const claudeModels = [
  { value: "haiku", label: "Haiku" },
  { value: "sonnet-5", label: "Sonnet 5" },
]
const openaiModels = [
  { value: "luna", label: "GPT-5.6 Luna" },
  { value: "terra", label: "GPT-5.6 Terra" },
]

export const defaultModel = (provider: string) => (provider === "openai" ? "luna" : provider === "claude" ? "sonnet-5" : "")

// Every product gets a card: the stored agents plus an empty default (General) and
// one per product that has none yet, as classic.
export const agentList = (stored: AgentConfig[], productIds: number[]): AgentConfig[] => {
  const agents = [...stored]
  if (!agents.some((a) => a.productId === null)) {
    agents.unshift({ id: 0, productId: null, description: "", instructions: "", enabled: true, webSearchEnabled: false })
  }
  for (const id of productIds) {
    if (!agents.some((a) => a.productId === id)) {
      agents.push({ id: 0, productId: id, description: "", instructions: "", enabled: false, webSearchEnabled: false })
    }
  }
  return agents
}

const firstError = (r: { error?: { errors?: { message: string }[] } }) => r.error?.errors?.[0]?.message

const ManageAIPage = (props: ManageAIPageProps) => {
  const products = Fider.session.tenant.products ?? []
  const [enabled, setEnabled] = useState(props.enabled)
  const [provider, setProvider] = useState(props.provider || "claude")
  const [model, setModel] = useState(props.model || (props.provider === "openai" ? "luna" : "sonnet-5"))
  const [apiKey, setApiKey] = useState("")
  const [hasKey, setHasKey] = useState(props.hasKey)
  const [keyRevealed, setKeyRevealed] = useState(false)
  const [customBaseUrl, setCustomBaseUrl] = useState(props.customBaseUrl)
  const [customModel, setCustomModel] = useState(props.customModel)
  const [webSearchEnabled, setWebSearchEnabled] = useState(props.webSearchEnabled)
  const [webSearchProvider, setWebSearchProvider] = useState(props.webSearchProvider || "serper")
  const [webSearchApiKey, setWebSearchApiKey] = useState("")
  const [webSearchHasKey, setWebSearchHasKey] = useState(props.webSearchHasKey)
  const [webSearchBaseUrl, setWebSearchBaseUrl] = useState(props.webSearchBaseUrl)
  const [agents, setAgents] = useState(() =>
    agentList(
      props.agents || [],
      products.map((p) => p.id)
    )
  )
  const [voraRequired, setVoraRequired] = useState(!!Fider.session.tenant.voraRequired)
  const [busy, setBusy] = useState(false)

  const t = (id: string, message: string) => i18n._({ id, message })

  const saveSettings = async () => {
    setBusy(true)
    const result = await actions.updateAISettings({
      enabled,
      provider,
      apiKey,
      model,
      customBaseUrl,
      customModel,
      webSearchEnabled,
      webSearchProvider,
      webSearchApiKey,
      webSearchBaseUrl,
    })
    setBusy(false)
    if (result.ok) {
      toast.success(t("ui2.admin.ai.saved", "AI settings saved."))
      setHasKey(hasKey || apiKey.trim() !== "")
      setApiKey("")
      setWebSearchHasKey(webSearchHasKey || webSearchApiKey.trim() !== "")
      setWebSearchApiKey("")
    } else {
      toast.error(firstError(result) || t("ui2.admin.ai.savefailed", "Failed to save AI settings."))
    }
  }

  const chooseProvider = (p: string) => {
    setProvider(p)
    setModel(defaultModel(p))
    // Switching provider hides any revealed key again.
    setKeyRevealed(false)
  }

  // Shows a Custom provider's saved key (handy for self-hosted endpoints).
  const revealKey = async () => {
    const result = await actions.getAIProviderKey()
    if (result.ok && result.data.apiKey) {
      setApiKey(result.data.apiKey)
      setKeyRevealed(true)
    } else {
      toast.error(firstError(result) || t("ui2.admin.ai.revealfailed", "Couldn't reveal the saved key."))
    }
  }

  const setAgent = (idx: number, patch: Partial<AgentConfig>) => setAgents((list) => list.map((a, i) => (i === idx ? { ...a, ...patch } : a)))

  const saveAgent = async (agent: AgentConfig) => {
    const result = await actions.upsertAIAgent({
      productId: agent.productId,
      description: agent.description,
      instructions: agent.instructions,
      enabled: agent.enabled,
      webSearchEnabled: agent.webSearchEnabled,
    })
    if (result.ok) {
      toast.success(t("ui2.admin.ai.agentsaved", "Vora updated."))
    } else {
      toast.error(firstError(result) || t("ui2.admin.ai.agentfailed", "Failed to save the agent."))
    }
  }

  const productName = (productId: number | null) => {
    if (productId === null) return products.length > 0 ? t("ui2.admin.ai.defaultgeneral", "Default (General)") : t("ui2.admin.ai.default", "Default")
    return products.find((p) => p.id === productId)?.name ?? `Product #${productId}`
  }

  const models = provider === "claude" ? claudeModels : provider === "openai" ? openaiModels : []
  const saveButton = (
    <div className="u2-actions">
      <Button variant="primary" loading={busy} onClick={saveSettings}>
        <Trans id="ui2.admin.ai.save">Save AI settings</Trans>
      </Button>
    </div>
  )

  return (
    <AdminLayout
      name="ai"
      title={<Trans id="ui2.admin.ai.title">AI</Trans>}
      subtitle={<Trans id="ui2.admin.ai.sub">Vora, the ideation agent: one switch, one provider, per-product instructions</Trans>}
    >
      <Field
        label={<Trans id="ui2.admin.ai.agent">Ideation agent</Trans>}
        hint={<Trans id="ui2.admin.ai.agenthint">Master switch: off hides Vora everywhere.</Trans>}
        group
      >
        <Toggle checked={enabled} label={t("ui2.admin.ai.agent", "Ideation agent")} hideLabel onChange={setEnabled} />
      </Field>
      <SubmissionToggle
        field="voraRequired"
        label={t("ui2.admin.ai.require", "Require Vora for new ideas")}
        onChange={setVoraRequired}
        hint={
          <Trans id="ui2.admin.ai.requirehint">
            New ideas from the board&apos;s form start with Vora, admins included unless they may skip it below: people review and edit Vora&apos;s draft, then
            submit. Applies to products where an agent is on; others keep the plain form. Assistants connected over MCP, and integrations using an API key, can
            still submit directly.
          </Trans>
        }
      />
      {voraRequired && (
        <>
          <SubmissionToggle field="voraBypassAdmins" label={t("ui2.admin.ai.bypassadmins", "Admins can skip Vora")} />
          <SubmissionToggle field="voraBypassCollaborators" label={t("ui2.admin.ai.bypasscollabs", "Collaborators can skip Vora")} />
        </>
      )}

      <AdminSection title={<Trans id="ui2.admin.ai.provider">Provider</Trans>}>
        <Field label={<Trans id="ui2.admin.ai.provider">Provider</Trans>} group>
          <RadioGroup
            name="provider"
            cards
            value={provider}
            onChange={chooseProvider}
            options={[
              { value: "claude", label: "Claude" },
              { value: "openai", label: "OpenAI" },
              { value: "custom", label: t("ui2.admin.ai.custom", "Custom") },
            ]}
          />
        </Field>
        {models.length > 0 && (
          <Field label={<Trans id="ui2.admin.ai.model">Model</Trans>} group>
            <RadioGroup name="model" cards value={model} onChange={setModel} options={models} />
          </Field>
        )}
        {provider === "custom" && (
          <>
            <TextInput
              name="customBaseUrl"
              label={<Trans id="ui2.admin.ai.baseurl">Base URL (OpenAI-compatible)</Trans>}
              placeholder="https://llm.example.com/v1"
              value={customBaseUrl}
              onChange={setCustomBaseUrl}
            />
            <TextInput name="customModel" label={<Trans id="ui2.admin.ai.modelname">Model name</Trans>} value={customModel} onChange={setCustomModel} />
          </>
        )}
        <TextInput
          name="apiKey"
          label={<Trans id="ui2.admin.ai.apikey">API key</Trans>}
          value={apiKey}
          onChange={setApiKey}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            hasKey ? t("ui2.admin.ai.keyreplace", "Enter a new key to replace the saved one") : t("ui2.admin.ai.keypaste", "Paste the provider API key")
          }
          hint={
            hasKey ? (
              <span data-testid="u2-ai-keyset">
                <Trans id="ui2.admin.ai.keysaved">A key is saved for this site.</Trans>
                {keyRevealed && (
                  <>
                    {" "}
                    <Trans id="ui2.admin.ai.keyshown">It is shown in the field; it will not be hidden again until you reload.</Trans>
                  </>
                )}
              </span>
            ) : (
              <Trans id="ui2.admin.ai.nokey">
                No key saved yet. Keys are stored server-side. For hosted providers (Claude / OpenAI) they are write-only; for a Custom provider you can reveal
                the saved key here.
              </Trans>
            )
          }
          after={
            hasKey &&
            provider === "custom" &&
            !keyRevealed && (
              <div>
                <Button small variant="ghost" onClick={revealKey} data-act="reveal">
                  <Trans id="ui2.admin.ai.reveal">Reveal saved key</Trans>
                </Button>
              </div>
            )
          }
        />
        {saveButton}
      </AdminSection>

      <AdminSection
        title={<Trans id="ui2.admin.ai.web">Web search</Trans>}
        lede={
          <Trans id="ui2.admin.ai.webhint">
            Let Vora look things up on the web to ground ideas in current information. Vora decides when to search based on each product&apos;s instructions
            below; tell her when it helps (e.g. &quot;search for existing tools before proposing one&quot;). Enable it per product in the cards below.
          </Trans>
        }
      >
        <Field label={<Trans id="ui2.admin.ai.webswitch">Master switch for web search</Trans>} group>
          <Toggle checked={webSearchEnabled} label={t("ui2.admin.ai.webswitch", "Master switch for web search")} hideLabel onChange={setWebSearchEnabled} />
        </Field>
        {webSearchEnabled && (
          <>
            <Field label={<Trans id="ui2.admin.ai.webprovider">Search provider</Trans>} group>
              <RadioGroup
                name="webSearchProvider"
                cards
                value={webSearchProvider}
                onChange={setWebSearchProvider}
                options={[
                  { value: "serper", label: "Serper.dev" },
                  { value: "searxng", label: t("ui2.admin.ai.searxng", "SearXNG (self-hosted)") },
                ]}
              />
            </Field>
            {webSearchProvider === "serper" ? (
              <TextInput
                name="webSearchApiKey"
                label={<Trans id="ui2.admin.ai.serperkey">Serper.dev API key</Trans>}
                value={webSearchApiKey}
                onChange={setWebSearchApiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  webSearchHasKey
                    ? t("ui2.admin.ai.keyreplace", "Enter a new key to replace the saved one")
                    : t("ui2.admin.ai.serperpaste", "Paste your Serper.dev API key")
                }
                hint={
                  <>
                    <Trans id="ui2.admin.ai.serperhint">
                      Get a free key at{" "}
                      <a href="https://serper.dev" target="_blank" rel="noopener noreferrer">
                        serper.dev
                      </a>{" "}
                      (2,500 free searches).
                    </Trans>{" "}
                    {webSearchHasKey && <Trans id="ui2.admin.ai.serpersaved">A key is saved.</Trans>}
                  </>
                }
              />
            ) : (
              <TextInput
                name="webSearchBaseUrl"
                label={<Trans id="ui2.admin.ai.searxngurl">SearXNG instance URL</Trans>}
                value={webSearchBaseUrl}
                onChange={setWebSearchBaseUrl}
                placeholder="https://searxng.example.com"
                hint={
                  <Trans id="ui2.admin.ai.searxnghint">
                    Free and open source: self-host{" "}
                    <a href="https://docs.searxng.org" target="_blank" rel="noopener noreferrer">
                      SearXNG
                    </a>{" "}
                    and point Vora at it. Enable its JSON format (<code>search.formats: [html, json]</code>). No API key or per-query cost.
                  </Trans>
                }
              />
            )}
            {saveButton}
          </>
        )}
      </AdminSection>

      <AdminSection
        title={<Trans id="ui2.admin.ai.perproduct">Vora, per product</Trans>}
        lede={
          <Trans id="ui2.admin.ai.perproducthint">
            The agent is always named Vora. Tune what it says about itself and how it interviews for each product; General uses the default.
          </Trans>
        }
      >
        {agents.map((agent, idx) => {
          const name = productName(agent.productId)
          return (
            <div key={agent.productId ?? "default"} className="u2-ai-agent" data-agent={agent.productId ?? "default"}>
              <Field label={<strong>{name}</strong>} group>
                <Toggle checked={agent.enabled} label={name} hideLabel onChange={(v) => setAgent(idx, { enabled: v })} />
              </Field>
              <TextInput
                name={`agent-desc-${idx}`}
                label={<Trans id="ui2.admin.ai.desc">Description (shown to users when the chat opens)</Trans>}
                value={agent.description}
                maxLength={500}
                onChange={(description) => setAgent(idx, { description })}
                placeholder="I help you turn a rough thought into an idea the team can evaluate."
              />
              <TextArea
                name={`agent-inst-${idx}`}
                label={<Trans id="ui2.admin.ai.inst">Instructions (how Vora interviews for this product)</Trans>}
                value={agent.instructions}
                onChange={(instructions) => setAgent(idx, { instructions })}
                placeholder="Ask about the problem before solutions. Always cover workflow, owner, and success measure. Search the web when it helps ground the idea..."
              />
              <Field
                label={<Trans id="ui2.admin.ai.agentweb">Web search</Trans>}
                hint={
                  webSearchEnabled ? (
                    <Trans id="ui2.admin.ai.agentwebon">Let Vora search the web for this product.</Trans>
                  ) : (
                    <Trans id="ui2.admin.ai.agentweboff">Web search is off site-wide; enable it above first.</Trans>
                  )
                }
                group
              >
                <Toggle
                  checked={agent.webSearchEnabled}
                  label={t("ui2.admin.ai.agentweb", "Web search")}
                  hideLabel
                  disabled={!webSearchEnabled}
                  onChange={(v) => setAgent(idx, { webSearchEnabled: v })}
                />
              </Field>
              <div className="u2-actions">
                <Button small onClick={() => saveAgent(agent)}>
                  <Trans id="ui2.admin.ai.saveagent">Save agent</Trans>
                </Button>
              </div>
            </div>
          )
        })}
      </AdminSection>
    </AdminLayout>
  )
}

export default ManageAIPage
