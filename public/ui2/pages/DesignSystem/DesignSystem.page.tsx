import "../../components/account/account.css"
import "./design.css"
import React, { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { Failure } from "@fider/services"
import { Button, Checkbox, Field, Form, IconButton, ImageUploader, RadioGroup, Select, TextArea, TextInput, Toggle } from "../../components/form"
import { MarkdownEditor } from "../../components/form/MarkdownEditor"
import { Avatar, ConfirmDialog, Modal, toast } from "../../components/feedback"
import { Markdown } from "../../components/content/Markdown"

// /_design: the new UI's component gallery, so the whole system can be reviewed in one
// place, in both themes. Sample content is placeholder text for reviewers.

const TOKENS = [
  "--u-bg",
  "--u-glass",
  "--u-edge",
  "--u-line",
  "--u-text",
  "--u-text2",
  "--u-muted",
  "--u-accent",
  "--u-accent-soft",
  "--u-on-accent",
  "--u-chip",
  "--u-pop",
  "--u-danger",
  "--u-warn",
  "--u-s-review",
  "--u-s-planned",
  "--u-s-progress",
  "--u-s-shipped",
]

const TYPE = [
  { name: "Page title", cls: "u2-ds-t1", size: "22 / 600" },
  { name: "Section title", cls: "u2-ds-t2", size: "16 / 600" },
  { name: "Body", cls: "u2-ds-t3", size: "14 / 400" },
  { name: "Small", cls: "u2-ds-t4", size: "13 / 400" },
  { name: "Mono (numbers, IDs)", cls: "u2-ds-t5 u2-mono", size: "12 / 500" },
]

const SAMPLE_MD = "## Heading\n\nSome **bold**, _italic_ and `code`, a [link](https://upvora.dev) and a list:\n\n- one\n- two\n\n> A quote."

const sampleFailure: Failure = {
  errors: [{ field: "title", message: "Title must have at least 10 characters." }, { message: "Something went wrong on the server." }],
}

const Section = (props: { id: string; title: string; children: React.ReactNode }) => (
  <section className="u2-panel u2-section" aria-labelledby={props.id}>
    <h2 id={props.id} className="u2-section__title">
      {props.title}
    </h2>
    {props.children}
  </section>
)

const DesignSystemPage = () => {
  const [text, setText] = useState("Acme")
  const [long, setLong] = useState("")
  const [choice, setChoice] = useState("b")
  const [radio, setRadio] = useState<"one" | "two">("one")
  const [on, setOn] = useState(true)
  const [checked, setChecked] = useState(false)
  const [modal, setModal] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  const flipTheme = () => {
    // Preview only: not stored, so a reload brings back the person's own theme.
    const dark = document.body.getAttribute("data-theme") === "dark"
    document.body.setAttribute("data-theme", dark ? "light" : "dark")
  }

  return (
    <div className="u2-page u2-ds">
      <header className="u2-page__head u2-row">
        <div>
          <h1 className="u2-page__title">
            <Trans id="ui2.design.title">Design system</Trans>
          </h1>
          <p className="u2-page__sub">
            <Trans id="ui2.design.subtitle">Tokens and components of the new look.</Trans>
          </p>
        </div>
        <Button onClick={flipTheme} className="u2-ds__theme">
          <Trans id="ui2.design.flip">Preview the other theme</Trans>
        </Button>
      </header>

      <Section id="u2-ds-colors" title="Colors">
        <ul className="u2-ds__swatches">
          {TOKENS.map((t) => (
            <li key={t}>
              <span className="u2-ds__swatch" style={{ background: `var(${t})` }} aria-hidden="true" />
              <code className="u2-mono">{t}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="u2-ds-type" title="Type">
        <ul className="u2-ds__type">
          {TYPE.map((t) => (
            <li key={t.name}>
              <span className={t.cls}>{t.name}</span>
              <code className="u2-mono u2-muted">{t.size}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="u2-ds-buttons" title="Buttons">
        <div className="u2-row">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="danger-solid">Danger, solid</Button>
          <Button variant="primary" loading>
            Loading
          </Button>
          <Button disabled>Disabled</Button>
          <Button small>Small</Button>
          <IconButton label="Settings">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </IconButton>
        </div>
      </Section>

      <Section id="u2-ds-form" title="Form fields">
        <Form error={showErrors ? sampleFailure : undefined}>
          <TextInput name="title" label="Text input" hint="A hint under the label." value={text} onChange={setText} />
          <TextInput name="subdomain" label="With suffix" value="acme" onChange={() => undefined} suffix=".upvora.app" />
          <TextArea name="long" label="Text area" hint="Grows as you type." value={long} onChange={setLong} placeholder="Type a few lines" />
          <Select
            name="choice"
            label="Select"
            value={choice}
            onChange={setChoice}
            options={[
              { value: "a", label: "Option A" },
              { value: "b", label: "Option B" },
            ]}
          />
          <Field label="Toggle" group>
            <Toggle label="Email me" checked={on} onChange={setOn} />
          </Field>
          <Field label="Checkbox" group>
            <Checkbox label="I agree" hint="With a hint." checked={checked} onChange={setChecked} />
          </Field>
          <Field label="Radio group" group>
            <RadioGroup
              name="radio"
              value={radio}
              onChange={setRadio}
              cards
              options={[
                { value: "one", label: "One", hint: "First" },
                { value: "two", label: "Two", hint: "Second" },
              ]}
            />
          </Field>
          <Field label="Image" group>
            <ImageUploader onChange={() => undefined} />
          </Field>
          <Field name="description" label="Markdown editor" stacked>
            <MarkdownEditor field="description" label="Description" initialValue={SAMPLE_MD} />
          </Field>
          <div className="u2-actions">
            <Button variant="ghost" onClick={() => setShowErrors(!showErrors)}>
              {showErrors ? "Hide server errors" : "Show server errors"}
            </Button>
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </Form>
      </Section>

      <Section id="u2-ds-feedback" title="Dialogs and toasts">
        <div className="u2-row">
          <Button onClick={() => setModal(true)}>Open dialog</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Confirm dialog
          </Button>
          <Button onClick={() => toast.success("Saved.")}>Success toast</Button>
          <Button onClick={() => toast.error("Could not save. Please try again.")}>Error toast</Button>
        </div>
        <Modal open={modal} onClose={() => setModal(false)} title="A dialog" footer={<Button onClick={() => setModal(false)}>Close</Button>}>
          <p>Focus stays inside; Esc closes and focus goes back.</p>
          <TextInput stacked name="inside" label="A field inside" value="" onChange={() => undefined} />
        </Modal>
        <ConfirmDialog open={confirm} danger title="Delete this?" confirmLabel="Delete" onConfirm={() => setConfirm(false)} onCancel={() => setConfirm(false)}>
          <p>This cannot be undone.</p>
        </ConfirmDialog>
      </Section>

      <Section id="u2-ds-avatars" title="Avatars">
        <div className="u2-row">
          <Avatar name="Ada Lovelace" size={20} />
          <Avatar name="Ada Lovelace" />
          <Avatar name="Grace Hopper" size={40} labelled />
        </div>
      </Section>

      <Section id="u2-ds-md" title="Rendered Markdown">
        <Markdown text={SAMPLE_MD} />
      </Section>
    </div>
  )
}

export default DesignSystemPage
