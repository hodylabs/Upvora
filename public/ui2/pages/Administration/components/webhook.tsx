import "./groupB.css"
import React, { useEffect, useRef, useState } from "react"
import { i18n } from "@lingui/core"
import { Trans } from "@lingui/react/macro"
import { HttpHeaders, Webhook, WebhookData, WebhookPreviewResult, WebhookStatus, WebhookTriggerResult, WebhookType } from "@fider/models"
import { actions, Failure, StringObject } from "@fider/services"
import { Button, Field, Form, Select, TextArea, TextInput, Toggle } from "../../../components/form"
import { Modal } from "../../../components/feedback"

// Classic's webhook pieces in the new look: the form (name, type, enabled, URL and
// content templates with a live preview, HTTP method and headers), the template
// help dialog (properties per type and template functions), and the failure
// details dialog shown after a failed test.

const t = (id: string, message: string) => i18n._({ id, message })

export const webhookTypeLabel = (type: WebhookType): string =>
  ({
    [WebhookType.NEW_POST]: t("ui2.admin.webhooks.type.newpost", "New Post"),
    [WebhookType.NEW_COMMENT]: t("ui2.admin.webhooks.type.newcomment", "New Comment"),
    [WebhookType.CHANGE_STATUS]: t("ui2.admin.webhooks.type.changestatus", "Change Status"),
    [WebhookType.DELETE_POST]: t("ui2.admin.webhooks.type.deletepost", "Delete Post"),
  })[type]

export const webhookStatusLabel = (status: WebhookStatus): string =>
  ({
    [WebhookStatus.ENABLED]: t("ui2.admin.webhooks.status.enabled", "Enabled"),
    [WebhookStatus.DISABLED]: t("ui2.admin.webhooks.status.disabled", "Disabled"),
    [WebhookStatus.FAILED]: t("ui2.admin.webhooks.status.failed", "Failed"),
  })[status]

/* Properties table (template help and failure details) */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const PropertyValue = (props: { value: any }): JSX.Element => {
  const v = props.value
  const gray = (txt: string) => <em className="u2-muted">&lt;{txt}&gt;</em>
  if (Array.isArray(v))
    return (
      <>
        {v.map((x, i) => (
          <div key={i}>
            <PropertyValue value={x} />
          </div>
        ))}
      </>
    )
  if (v === "") return gray("empty")
  if (v === null) return gray("null")
  if (v === undefined) return gray("undefined")
  if (v === true || v === false) return <code>{String(v)}</code>
  if (typeof v === "object")
    return <WebhookProperties properties={v} propsName={t("ui2.admin.webhooks.name", "Name")} valueName={t("ui2.admin.webhooks.value", "Value")} />
  return <span>{String(v)}</span>
}

export const WebhookProperties = (props: { properties: StringObject; propsName: string; valueName: string }) => (
  <table className="u2-wh__props">
    <thead>
      <tr>
        <th scope="col">{props.propsName}</th>
        <th scope="col">{props.valueName}</th>
      </tr>
    </thead>
    <tbody>
      {Object.entries(props.properties || {}).map(([prop, val]) => (
        <tr key={prop}>
          <td>
            <code>{prop}</code>
          </td>
          <td>
            <PropertyValue value={val} />
          </td>
        </tr>
      ))}
    </tbody>
  </table>
)

/* Template help */

interface FunctionSpec {
  params: { type: string; desc: string; info?: string; link?: string }[]
  description: string
  info?: string
  link?: string
}

const functions = (): StringObject<FunctionSpec> => ({
  stripHtml: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.striphtml.p", "The input string containing HTML to strip") }],
    description: t("ui2.admin.webhooks.fn.striphtml", "Strip HTML tags from the input data"),
    info: t("ui2.admin.webhooks.fn.striphtml.i", "It removes all tags to keep only content"),
  },
  md5: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.md5.p", "The input string to hash") }],
    description: t("ui2.admin.webhooks.fn.md5", "Hash text using md5 algorithm"),
    info: t("ui2.admin.webhooks.fn.md5.i", "What is MD5?"),
    link: "https://en.wikipedia.org/wiki/MD5",
  },
  lower: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.lower.p", "The input string to lowercase") }],
    description: t("ui2.admin.webhooks.fn.lower", "Lowercase text"),
  },
  upper: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.upper.p", "The input string to uppercase") }],
    description: t("ui2.admin.webhooks.fn.upper", "Uppercase text"),
  },
  markdown: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.markdown.p", "The input string containing Markdown to parse") }],
    description: t("ui2.admin.webhooks.fn.markdown", "Parse Markdown to HTML from the input data"),
    info: t("ui2.admin.webhooks.fn.markdown.i", "When parsing, input is sanitized from HTML to prevent XSS attacks"),
  },
  format: {
    params: [
      {
        type: "string",
        desc: t("ui2.admin.webhooks.fn.format.p1", "The date format according to Go specifications"),
        info: t("ui2.admin.webhooks.fn.format.i", "See Go time format"),
        link: "https://yourbasic.org/golang/format-parse-string-time-date-example/#standard-time-and-date-formats",
      },
      { type: "time", desc: t("ui2.admin.webhooks.fn.format.p2", "The time to format") },
    ],
    description: t("ui2.admin.webhooks.fn.format", "Format the given date and time"),
  },
  quote: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.quote.p", "The input string to quote") }],
    description: t("ui2.admin.webhooks.fn.quote", "Enquote a string and escape inner special characters"),
    info: t("ui2.admin.webhooks.fn.quote.i", "You should use this function when using a value as a JSON field"),
  },
  escape: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.escape.p", "The input string to escape") }],
    description: t("ui2.admin.webhooks.fn.escape", "Escape inner special characters of a string, without enquoting it"),
    info: t("ui2.admin.webhooks.fn.escape.i", "You should use this function when using a value within an enquoted string"),
  },
  urlquery: {
    params: [{ type: "string", desc: t("ui2.admin.webhooks.fn.urlquery.p", "The input string to encode as URL query value") }],
    description: t("ui2.admin.webhooks.fn.urlquery", "Encode a string into a valid URL query element"),
    info: t("ui2.admin.webhooks.fn.urlquery.i", "You should use this function when using a value in URL"),
  },
  truncate: {
    params: [
      { type: "string", desc: t("ui2.admin.webhooks.fn.truncate.p1", "The input string to truncate") },
      { type: "number", desc: t("ui2.admin.webhooks.fn.truncate.p2", "Length of output string") },
    ],
    description: t("ui2.admin.webhooks.fn.truncate", "Truncate the string"),
  },
})

const textExample = 'A new post entitled "{{ .post_title }}" has been created by {{ .author_name }}.'
const jsonExample = `{
  "title": "New post: {{ escape .post_title }}",
  "content": {{ quote .post_description }},
  "user": {{ quote .author_name }},
  "date": {{ format "2006-01-02T15:04:05-0700" .post_created_at | quote }}
}`

const Info = (props: { text?: string; link?: string }) =>
  props.text ? (
    <span className="u2-muted">
      {" "}
      (
      {props.link ? (
        <a href={props.link} target="_blank" rel="noopener noreferrer">
          {props.text}
        </a>
      ) : (
        props.text
      )}
      )
    </span>
  ) : null

export const WebhookTemplateInfoModal = (props: { type: WebhookType; open: boolean; onClose: () => void }) => {
  // undefined while loading, null when it failed.
  const [properties, setProperties] = useState<StringObject | null | undefined>()

  useEffect(() => {
    if (!props.open) return
    let live = true
    setProperties(undefined)
    actions
      .getWebhookHelp(props.type)
      .then((r) => live && setProperties(r.ok ? r.data : null))
      .catch(() => live && setProperties(null))
    return () => {
      live = false
    }
  }, [props.type, props.open])

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      size="lg"
      title={<Trans id="ui2.admin.webhooks.help.title">Webhook template formatting help</Trans>}
      footer={
        <Button variant="ghost" onClick={props.onClose}>
          <Trans id="ui2.admin.webhooks.close">Close</Trans>
        </Button>
      }
    >
      <h3 className="u2-admin__h2">
        <Trans id="ui2.admin.webhooks.help.what">What is a template?</Trans>
      </h3>
      <p>
        <Trans id="ui2.admin.webhooks.help.intro">
          The template engine used is the native Go <code>text/template</code> package. The simplest way to create a template is to write your text, and insert
          the property name, prefixed by a dot, enclosed in double braces with spaces within. Example:
        </Trans>
      </p>
      <pre>{textExample}</pre>
      <p>
        <Trans id="ui2.admin.webhooks.help.json">
          When using a structured text format such as JSON, you may need to wrap those properties into quotes. But be careful: you must escape values by
          yourself by calling the appropriate function depending on your situation. Example:
        </Trans>
      </p>
      <pre>{jsonExample}</pre>
      <p>
        <a className="u2-btn u2-btn--primary" href="https://pkg.go.dev/text/template" target="_blank" rel="noopener noreferrer">
          <Trans id="ui2.admin.webhooks.help.godocs">Official Go templates documentation</Trans>
        </a>
      </p>
      {properties === undefined ? (
        <p className="u2-muted" aria-busy="true">
          <Trans id="ui2.admin.webhooks.help.loading">Loading help data</Trans>
        </p>
      ) : properties === null ? (
        <p className="u2-muted">
          <Trans id="ui2.admin.webhooks.help.failed">Failed to load help data</Trans>
        </p>
      ) : (
        <>
          <h3 className="u2-admin__h2">
            <Trans id="ui2.admin.webhooks.help.props">Properties</Trans>
          </h3>
          <WebhookProperties
            properties={properties}
            propsName={t("ui2.admin.webhooks.propname", "Property name")}
            valueName={t("ui2.admin.webhooks.example", "Example value")}
          />
          <h3 className="u2-admin__h2">
            <Trans id="ui2.admin.webhooks.help.functions">Functions</Trans>
          </h3>
          <table className="u2-wh__props">
            <thead>
              <tr>
                <th scope="col">
                  <Trans id="ui2.admin.webhooks.help.function">Function</Trans>
                </th>
                <th scope="col">
                  <Trans id="ui2.admin.webhooks.help.description">Description</Trans>
                </th>
                <th scope="col">
                  <Trans id="ui2.admin.webhooks.help.params">Parameters (type: description)</Trans>
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(functions()).map(([name, spec]) => (
                <tr key={name}>
                  <td>
                    <code>{name}</code>
                  </td>
                  <td>
                    {spec.description}
                    <Info text={spec.info} link={spec.link} />
                  </td>
                  <td>
                    {spec.params.map((p, i) => (
                      <div key={i}>
                        <code>{p.type}</code>: {p.desc}
                        <Info text={p.info} link={p.link} />
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  )
}

/* Failure details */

const InfoProperty = (props: { value: string | number; name: string; info: string; multiline?: boolean }) =>
  props.value ? (
    <div>
      <h3 className="u2-admin__h2">{props.name}</h3>
      <p className="u2-admin__sub">{props.info}</p>
      {props.multiline ? <pre>{props.value}</pre> : <p>{props.value}</p>}
    </div>
  ) : (
    <p className="u2-muted">
      <Trans id="ui2.admin.webhooks.fail.notavailable">
        <strong>{props.name}</strong> info not available
      </Trans>
    </p>
  )

export const WebhookFailInfo = (props: { result: WebhookTriggerResult; open: boolean; onClose: () => void }) => (
  <Modal
    open={props.open}
    onClose={props.onClose}
    size="lg"
    title={<Trans id="ui2.admin.webhooks.fail.title">Webhook trigger failure details</Trans>}
    footer={
      <Button variant="ghost" onClick={props.onClose}>
        <Trans id="ui2.admin.webhooks.close">Close</Trans>
      </Button>
    }
  >
    <InfoProperty
      value={props.result.message}
      name={t("ui2.admin.webhooks.fail.message", "Message")}
      info={t("ui2.admin.webhooks.fail.messagei", "Generic information about where it failed")}
    />
    <InfoProperty
      value={props.result.error}
      name={t("ui2.admin.webhooks.fail.error", "Error")}
      info={t("ui2.admin.webhooks.fail.errori", "Detailed information about what failed")}
      multiline
    />
    <InfoProperty
      value={props.result.url}
      name={t("ui2.admin.webhooks.fail.url", "URL")}
      info={t("ui2.admin.webhooks.fail.urli", "Parsed URL where the request has been made")}
    />
    <InfoProperty
      value={props.result.content}
      name={t("ui2.admin.webhooks.fail.content", "Content")}
      info={t("ui2.admin.webhooks.fail.contenti", "Parsed content that was sent as request body")}
      multiline
    />
    <InfoProperty
      value={props.result.status_code}
      name={t("ui2.admin.webhooks.fail.status", "Status code")}
      info={t("ui2.admin.webhooks.fail.statusi", "HTTP response status code of the request")}
    />
    <h3 className="u2-admin__h2">
      <Trans id="ui2.admin.webhooks.help.props">Properties</Trans>
    </h3>
    <p className="u2-admin__sub">
      <Trans id="ui2.admin.webhooks.fail.propsi">Properties used when parsing URL and content</Trans>
    </p>
    <WebhookProperties
      properties={props.result.props || {}}
      propsName={t("ui2.admin.webhooks.propname", "Property name")}
      valueName={t("ui2.admin.webhooks.resolved", "Resolved value")}
    />
  </Modal>
)

/* Form */

// The new-header row adds; an existing header's value can be edited or the header removed.
const HeaderRow = (props: { header?: string; value?: string; existing: string[]; onEdit: (h: string, v: string) => void; onRemove?: (h: string) => void }) => {
  const isNew = !props.onRemove
  const [header, setHeader] = useState(props.header || "")
  const [value, setValue] = useState(props.value || "")
  const [editing, setEditing] = useState(isNew)
  const duplicate = isNew && props.existing.includes(header)
  const hLabel = t("ui2.admin.webhooks.header", "Header")
  const vLabel = t("ui2.admin.webhooks.headervalue", "Value")

  return (
    <div className="u2-row" data-header={props.header || "new"}>
      <input
        className="u2-ctl"
        style={{ flex: 1, minWidth: 120 }}
        aria-label={hLabel}
        placeholder={hLabel}
        value={header}
        disabled={!isNew}
        aria-invalid={duplicate || undefined}
        onChange={(e) => setHeader(e.target.value)}
      />
      <input
        className="u2-ctl"
        style={{ flex: 1, minWidth: 120 }}
        aria-label={`${header || hLabel} ${vLabel}`}
        placeholder={vLabel}
        value={value}
        disabled={!editing}
        onChange={(e) => setValue(e.target.value)}
      />
      {duplicate && (
        <span className="u2-fld__error" role="alert">
          <Trans id="ui2.admin.webhooks.duplicate">Duplicate</Trans>
        </span>
      )}
      {isNew ? (
        <Button
          small
          variant="primary"
          disabled={duplicate || header.length === 0 || value.length === 0}
          onClick={() => {
            props.onEdit(header, value)
            setHeader("")
            setValue("")
          }}
        >
          <Trans id="ui2.admin.webhooks.add">Add</Trans>
        </Button>
      ) : editing ? (
        <Button
          small
          variant="primary"
          disabled={value.length === 0}
          onClick={() => {
            setEditing(false)
            props.onEdit(header, value)
          }}
        >
          <Trans id="action.save">Save</Trans>
        </Button>
      ) : (
        <>
          <Button small onClick={() => setEditing(true)}>
            <Trans id="action.edit">Edit</Trans>
          </Button>
          <Button small variant="danger" onClick={() => props.onRemove?.(header)}>
            <Trans id="ui2.admin.webhooks.remove">Remove</Trans>
          </Button>
        </>
      )}
    </div>
  )
}

export const PREVIEW_DELAY_MS = 2000

interface WebhookFormProps {
  webhook?: Webhook
  onSave: (data: WebhookData) => Promise<Failure | undefined>
  onCancel: () => void
}

export const WebhookForm = (props: WebhookFormProps) => {
  const w = props.webhook
  const [name, setName] = useState(w?.name || "")
  const [type, setType] = useState<WebhookType>(w?.type || WebhookType.NEW_POST)
  const [status, setStatus] = useState<WebhookStatus>(w?.status || WebhookStatus.ENABLED)
  const [url, setUrl] = useState(w?.url || "")
  const [content, setContent] = useState(w?.content || "")
  const [httpMethod, setHttpMethod] = useState(w?.http_method || "POST")
  const [httpHeaders, setHttpHeaders] = useState<HttpHeaders>(w?.http_headers || {})
  // undefined while loading, null when it failed.
  const [preview, setPreview] = useState<WebhookPreviewResult | null | undefined>()
  const [helpOpen, setHelpOpen] = useState(false)
  const [error, setError] = useState<Failure | undefined>()
  const [busy, setBusy] = useState(false)
  const first = useRef(true)

  // As classic: preview at once on open, then 2 s after the URL or content stops changing.
  useEffect(() => {
    let live = true
    const run = () =>
      actions
        .previewWebhook(type, url, content)
        .then(
          (r) => (r.ok ? r.data : null),
          () => null
        )
        .then((p) => live && setPreview(p))
    setPreview(undefined)
    if (first.current) {
      first.current = false
      run()
      return () => {
        live = false
      }
    }
    const timer = window.setTimeout(run, PREVIEW_DELAY_MS)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [url, content])

  const save = async () => {
    setBusy(true)
    const failure = await props.onSave({ name, type, status, url, content, http_method: httpMethod, http_headers: httpHeaders })
    setBusy(false)
    if (failure) setError(failure)
  }

  const setHeader = (header: string, value: string) => setHttpHeaders((h) => ({ ...h, [header]: value }))
  const removeHeader = (header: string) =>
    setHttpHeaders((h) => {
      const { [header]: _, ...rest } = h // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest
    })

  const templateHelp = (
    <Button small variant="ghost" onClick={() => setHelpOpen(true)}>
      <Trans id="ui2.admin.webhooks.templatehelp">Template help</Trans>
    </Button>
  )
  const templateHint = <Trans id="ui2.admin.webhooks.templatehint">You can use Go template formatting with many properties here.</Trans>

  return (
    <div className="u2-editbox">
      {status === WebhookStatus.FAILED && (
        <p className="u2-admin__note u2-admin__note--danger" role="alert">
          <Trans id="ui2.admin.webhooks.hasfailed">This webhook has failed</Trans>
        </p>
      )}
      <h2 className="u2-editbox__h">
        {w ? (
          <Trans id="ui2.admin.webhooks.edittitle">
            Webhook #{w.id}: {w.name}
          </Trans>
        ) : (
          <Trans id="ui2.admin.webhooks.newtitle">New webhook</Trans>
        )}
      </h2>
      <Form error={error} onSubmit={save}>
        <TextInput name="name" label={<Trans id="ui2.admin.webhooks.namelabel">Name</Trans>} value={name} onChange={setName} placeholder="My awesome webhook" />
        <Select
          name="type"
          label={<Trans id="ui2.admin.webhooks.typelabel">Type</Trans>}
          value={type}
          onChange={(v) => setType(v as WebhookType)}
          options={[WebhookType.NEW_POST, WebhookType.NEW_COMMENT, WebhookType.CHANGE_STATUS, WebhookType.DELETE_POST].map((v) => ({
            value: v,
            label: webhookTypeLabel(v),
          }))}
        />
        <Field
          name="status"
          group
          label={<Trans id="ui2.admin.webhooks.enabled">Enabled</Trans>}
          hint={
            status === WebhookStatus.FAILED ? <Trans id="ui2.admin.webhooks.disabledfail">This webhook was disabled due to a trigger failure</Trans> : undefined
          }
        >
          <Toggle
            checked={status === WebhookStatus.ENABLED}
            hideLabel
            label={t("ui2.admin.webhooks.enabled", "Enabled")}
            onChange={(on) => setStatus(on ? WebhookStatus.ENABLED : WebhookStatus.DISABLED)}
          />
        </Field>
        <TextInput
          name="url"
          label={<Trans id="ui2.admin.webhooks.url">URL</Trans>}
          hint={templateHint}
          value={url}
          onChange={setUrl}
          placeholder="https://webhook.site/..."
          after={templateHelp}
        />
        <TextArea
          name="content"
          label={<Trans id="ui2.admin.webhooks.content">Content</Trans>}
          hint={templateHint}
          value={content}
          onChange={setContent}
          placeholder="Request body"
          after={templateHelp}
        />
        <TextInput
          name="http_method"
          label={<Trans id="ui2.admin.webhooks.method">HTTP Method</Trans>}
          value={httpMethod}
          onChange={setHttpMethod}
          placeholder="POST"
        />
        <Field
          name="http_headers"
          group
          label={<Trans id="ui2.admin.webhooks.headers">HTTP Headers</Trans>}
          hint={<Trans id="ui2.admin.webhooks.headershint">Those headers are sent in the request when the webhook is triggered.</Trans>}
        >
          {Object.entries(httpHeaders).map(([h, v]) => (
            <HeaderRow key={h} header={h} value={v} existing={[]} onEdit={setHeader} onRemove={removeHeader} />
          ))}
          <HeaderRow existing={Object.keys(httpHeaders)} onEdit={setHeader} />
        </Field>
        {(url || content) && (
          <Field label={<Trans id="ui2.admin.webhooks.preview">Preview</Trans>} group>
            <div className="u2-wh__preview" role="status" data-testid="u2-wh-preview">
              {preview === null ? (
                <p className="u2-muted">
                  <Trans id="ui2.admin.webhooks.previewfailed">Failed to load preview</Trans>
                </p>
              ) : preview === undefined ? (
                <p className="u2-muted" aria-busy="true">
                  <Trans id="ui2.admin.webhooks.previewloading">Loading preview</Trans>
                </p>
              ) : (
                <>
                  {url && (
                    <div>
                      <strong>
                        <Trans id="ui2.admin.webhooks.url">URL</Trans>
                      </strong>
                      <pre>{preview.url.value ? preview.url.value : preview.url.error}</pre>
                      {preview.url.message && <p className="u2-muted">{preview.url.message}</p>}
                    </div>
                  )}
                  {content && (
                    <div>
                      <strong>
                        <Trans id="ui2.admin.webhooks.content">Content</Trans>
                      </strong>
                      <pre>{preview.content.value ? preview.content.value : preview.content.error}</pre>
                      {preview.content.message && <p className="u2-muted">{preview.content.message}</p>}
                    </div>
                  )}
                </>
              )}
            </div>
          </Field>
        )}
        <div className="u2-actions">
          <Button variant="ghost" onClick={props.onCancel}>
            <Trans id="action.cancel">Cancel</Trans>
          </Button>
          <Button type="submit" variant="primary" loading={busy}>
            <Trans id="action.save">Save</Trans>
          </Button>
        </div>
      </Form>
      <WebhookTemplateInfoModal type={type} open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}
