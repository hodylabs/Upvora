import React from "react"
import { Trans } from "@lingui/react/macro"
import { AdminLayout, AdminSection } from "../AdminLayout"

// Export: plain download links to the server's export routes (admin-only there).
// Tags JSON is also on the Tags page, next to its import.

const Download = (props: { href: string; name: string }) => (
  <a className="u2-btn u2-btn--secondary" href={props.href} download>
    <svg viewBox="0 0 24 24" aria-hidden="true" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 4v12m0 0l-5-5m5 5l5-5M5 20h14" />
    </svg>
    <span className="u2-mono">{props.name}</span>
  </a>
)

const ExportPage = () => (
  <AdminLayout name="export" title={<Trans id="ui2.admin.export.title">Export</Trans>} subtitle={<Trans id="ui2.admin.export.sub">Download your data</Trans>}>
    <AdminSection
      title={<Trans id="ui2.admin.export.posts">Export Posts</Trans>}
      lede={
        <Trans id="ui2.admin.export.postshint">
          Use this button to download a CSV file with all posts in this site. This can be useful to analyse the data with an external tool or simply to back it
          up.
        </Trans>
      }
    >
      <Download href="/admin/export/posts.csv" name="posts.csv" />
    </AdminSection>
    <AdminSection
      title={<Trans id="ui2.admin.export.tags">Export Tags</Trans>}
      lede={<Trans id="ui2.admin.export.tagshint">Download every tag as a JSON file, ready to import on another site from its Tags page.</Trans>}
    >
      <Download href="/admin/export/tags.json" name="tags.json" />
    </AdminSection>
    <AdminSection
      title={<Trans id="ui2.admin.export.backup">Backup your data</Trans>}
      lede={
        <Trans id="ui2.admin.export.backuphint">
          Use this button to download a ZIP file with your data in JSON format. This is a full backup and contains all of your data.
        </Trans>
      }
    >
      <Download href="/admin/export/backup.zip" name="backup.zip" />
    </AdminSection>
  </AdminLayout>
)

export default ExportPage
