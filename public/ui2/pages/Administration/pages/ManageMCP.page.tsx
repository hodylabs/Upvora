import React, { useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { actions, Fider } from "@fider/services"
import { MCPClient, MCPMinRole, MCPSettings } from "@fider/services/actions/oauth"
import { Button, Field, Select, TextInput, Toggle } from "../../../components/form"
import { toast } from "../../../components/feedback"
import { AdminLayout, AdminSection } from "../AdminLayout"

// MCP: classic's page in the new look. The three settings (enable, who may connect,
// self-registration) save on every change, one save at a time; only the latest save
// may roll back, and only to the last settings the server accepted. Clients are
// listed, registered and removed (removal takes two clicks: it disconnects everyone
// who approved that client).

interface ManageMCPPageProps {
  clients: MCPClient[]
  mcpUrl: string
  publicMcpUrls?: string[]
}

// Where clients connect: this site's own address, and any MCP-only public addresses
// (MCP_ORIGINS) for a board that is not reachable from the internet.
export const MCPConnectAddresses = (props: { mcpUrl: string; publicMcpUrls?: string[] }) => {
  const publicUrls = props.publicMcpUrls || []
  return (
    <>
      <p className="u2-admin__sub">
        <Trans id="ui2.admin.mcp.address">
          When on, MCP clients such as Claude can connect at <code>{props.mcpUrl}</code>. Each person signs in with this site&apos;s normal sign-in and approves
          the connection; the client can then do only what that person can do.
        </Trans>
      </p>
      {publicUrls.length > 0 && (
        <p className="u2-admin__sub" data-testid="u2-mcp-public">
          <Trans id="ui2.admin.mcp.public">For assistants that cannot reach this site (they connect from the internet), use the public MCP address:</Trans>{" "}
          {publicUrls.map((url, i) => (
            <React.Fragment key={url}>
              {i > 0 && ", "}
              <code>{url}</code>
            </React.Fragment>
          ))}
          .{" "}
          <Trans id="ui2.admin.mcp.publicnote">It serves only the MCP connection; people still sign in here, on this site, the first time they connect.</Trans>
        </p>
      )}
    </>
  )
}

export const initialMCPSettings = (): MCPSettings => {
  const t = Fider.session.tenant
  return { enabled: !!t.mcpEnabled, minRole: t.mcpMinRole || "administrator", dcrEnabled: t.mcpDcrEnabled ?? true }
}

const ManageMCPPage = (props: ManageMCPPageProps) => {
  const [settings, setSettings] = useState<MCPSettings>(initialMCPSettings)
  const confirmed = useRef<MCPSettings>(settings)
  const latest = useRef<MCPSettings>(settings)
  const seq = useRef(0)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const [clients, setClients] = useState<MCPClient[]>(props.clients || [])
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | undefined>()
  const [newName, setNewName] = useState("")
  const [newRedirect, setNewRedirect] = useState("")

  const update = (patch: Partial<MCPSettings>) => {
    const next = { ...latest.current, ...patch }
    latest.current = next
    const mine = ++seq.current
    setSettings(next)
    queue.current = queue.current.then(async () => {
      const res = await actions.updateMCPSettings(next).catch(() => ({ ok: false }))
      if (res.ok) {
        confirmed.current = next
        toast.success(i18n._({ id: "ui2.admin.mcp.saved", message: "Your MCP settings have been saved." }))
      } else if (mine === seq.current) {
        latest.current = confirmed.current
        setSettings(confirmed.current)
      }
    })
  }

  const createClient = async () => {
    const res = await actions.createMCPClient(newName.trim(), [newRedirect.trim()])
    if (res.ok && res.data) {
      const created = res.data
      setClients((list) => [created, ...list])
      setNewName("")
      setNewRedirect("")
    }
  }

  const deleteClient = async (id: number) => {
    const res = await actions.deleteMCPClient(id)
    if (res.ok) {
      setConfirmRemoveId(undefined)
      setClients((list) => list.filter((c) => c.id !== id))
    }
  }

  return (
    <AdminLayout
      name="mcp"
      title={<Trans id="ui2.admin.mcp.title">MCP</Trans>}
      subtitle={<Trans id="ui2.admin.mcp.sub">Let AI assistants (MCP clients) work in Upvora as the signed-in user</Trans>}
    >
      <Field label={<Trans id="ui2.admin.mcp.enable">Enable MCP</Trans>} group>
        <Toggle
          checked={settings.enabled}
          label={i18n._({ id: "ui2.admin.mcp.enable", message: "Enable MCP" })}
          hideLabel
          onChange={(v) => update({ enabled: v })}
        />
        <MCPConnectAddresses mcpUrl={props.mcpUrl} publicMcpUrls={props.publicMcpUrls} />
      </Field>
      <Select
        name="minRole"
        label={<Trans id="ui2.admin.mcp.minrole">Who may connect</Trans>}
        value={settings.minRole}
        onChange={(v) => update({ minRole: v as MCPMinRole })}
        options={[
          { value: "administrator", label: i18n._({ id: "ui2.admin.mcp.role.admin", message: "Administrators only" }) },
          { value: "collaborator", label: i18n._({ id: "ui2.admin.mcp.role.collab", message: "Administrators and collaborators" }) },
          { value: "visitor", label: i18n._({ id: "ui2.admin.mcp.role.visitor", message: "Any signed-in member" }) },
        ]}
      />
      <Field
        label={<Trans id="ui2.admin.mcp.dcr">Clients may register themselves</Trans>}
        hint={
          <Trans id="ui2.admin.mcp.dcrhint">
            Lets an MCP client register automatically. Registering grants nothing on its own: people still sign in and approve. Turn this off to allow only the
            clients listed below.
          </Trans>
        }
        group
      >
        <Toggle
          checked={settings.dcrEnabled}
          label={i18n._({ id: "ui2.admin.mcp.dcr", message: "Clients may register themselves" })}
          hideLabel
          onChange={(v) => update({ dcrEnabled: v })}
        />
      </Field>

      <AdminSection
        title={<Trans id="ui2.admin.mcp.clients">Registered clients</Trans>}
        lede={<Trans id="ui2.admin.mcp.removenote">Removing a client disconnects everyone who approved it.</Trans>}
      >
        {clients.length === 0 ? (
          <p className="u2-alist__empty">
            <Trans id="ui2.admin.mcp.none">No clients yet.</Trans>
          </p>
        ) : (
          <ul className="u2-alist">
            {clients.map((c) => (
              <li key={c.id} data-client={c.id}>
                <div className="u2-alist__main">
                  <strong>{c.name}</strong>
                  <div className="u2-alist__meta">
                    <code>{c.clientId}</code>
                    {c.redirectUris.length > 0 && <> · {c.redirectUris.join(", ")}</>}
                  </div>
                </div>
                <div className="u2-alist__acts">
                  {confirmRemoveId === c.id ? (
                    <>
                      <Button small variant="danger-solid" onClick={() => deleteClient(c.id)} data-act="confirm">
                        <Trans id="ui2.admin.mcp.confirmremove">Confirm remove</Trans>
                      </Button>
                      <Button small variant="ghost" onClick={() => setConfirmRemoveId(undefined)}>
                        <Trans id="ui2.admin.mcp.keep">Keep</Trans>
                      </Button>
                    </>
                  ) : (
                    <Button small variant="danger" onClick={() => setConfirmRemoveId(c.id)} data-act="remove">
                      <Trans id="ui2.admin.mcp.remove">Remove</Trans>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <AdminSection title={<Trans id="ui2.admin.mcp.register">Register a client</Trans>}>
        <TextInput name="newName" label={<Trans id="ui2.admin.mcp.name">Name</Trans>} value={newName} onChange={setNewName} />
        <TextInput
          name="newRedirect"
          label={<Trans id="ui2.admin.mcp.redirect">Redirect URI</Trans>}
          placeholder="https://claude.ai/api/mcp/auth_callback"
          value={newRedirect}
          onChange={setNewRedirect}
        />
        <div className="u2-actions">
          <Button onClick={createClient} data-act="register">
            <Trans id="ui2.admin.mcp.registerbtn">Register client</Trans>
          </Button>
        </div>
      </AdminSection>
    </AdminLayout>
  )
}

export default ManageMCPPage
