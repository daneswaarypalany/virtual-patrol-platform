import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { Camera, CheckCircle2, FileText, ShieldAlert, X } from 'lucide-react'

export type TemplatePreviewField = {
  key: string
  label: string
  description?: string
  group?: string
  items?: { key: string; label: string }[]
  options?: Record<string, boolean>
  width?: number
  height?: number
  variant?: 'text' | 'divider' | 'spacer'
  text?: string
  /** Normalised share of the row, used to label the rendered preview size. */
  previewWidth?: number
}

type Props = {
  kind: 'report' | 'summary'
  templateName?: string
  rows: TemplatePreviewField[][]
  onClose: () => void
}

const enabled = (field: TemplatePreviewField, key: string) => field.options?.[key] !== false
const visibleItems = (field: TemplatePreviewField) =>
  (field.items ?? []).filter((item) => enabled(field, item.key))

function FieldShell({ field, children }: { field: TemplatePreviewField; children: ReactNode }) {
  return (
    <section className="rb-preview-field" style={{ minHeight: field.height ? `${Math.min(field.height, 1000)}px` : undefined }}>
      <span className="rb-preview-size-tag">
        W {Math.round(field.previewWidth ?? field.width ?? 100)}% · H {field.height ? `${field.height}px min` : 'Auto'}
      </span>
      {children}
    </section>
  )
}

function PreviewTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (!headers.length) return <p className="rb-preview-muted">No table columns selected.</p>
  return (
    <table className="rb-preview-table">
      <thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{headers.map((h, j) => <td key={`${i}-${h}`}>{row[j] ?? '—'}</td>)}</tr>)}</tbody>
    </table>
  )
}

function ReportFieldPreview({ field }: { field: TemplatePreviewField }) {
  const items = visibleItems(field)
  const selected = (key: string) => enabled(field, key)

  if (field.key === 'header') {
    return (
      <div className="rb-preview-header-shell" style={{ minHeight: field.height ? `${field.height}px` : undefined }}>
        <span className="rb-preview-size-tag">W {Math.round(field.previewWidth ?? 100)}% · H {field.height ? `${field.height}px min` : 'Auto'}</span>
        <div className="rb-preview-report-header">
        {selected('organizationLogo') && <div className="rb-preview-brand-mark">A</div>}
        <div className="rb-preview-header-copy">
          {selected('reportTitle') && <><span className="rb-preview-eyebrow">A-FORCE PROTECTION</span><h1>Patrol Inspection Report</h1></>}
          {selected('generatedTime') && <p>Generated 04 November 2026 · 10:30 AM</p>}
        </div>
        <span className="rb-preview-document-tag">PATROL REPORT</span>
        </div>
      </div>
    )
  }

  if (field.key === 'patrolSummary') {
    const values: Record<string, string> = {
      site: 'A-Force Protection Office', route: 'Main Office Patrol', operator: 'Alex Morgan',
      status: 'Completed', startTime: '09:00 AM', endTime: '09:42 AM', checkpointCount: '12 checkpoints',
    }
    return <FieldShell field={field}>
      <div className="rb-preview-section-heading"><div><span className="rb-preview-kicker">OVERVIEW</span><h3>Patrol Summary</h3></div>{selected('issuesBanner') && <span className="rb-preview-status-good"><CheckCircle2 size={13}/> No critical issues</span>}</div>
      <div className="rb-preview-meta-grid">{items.filter((i) => i.key !== 'issuesBanner').map((item) => <div className="rb-preview-meta" key={item.key}><span>{item.label}</span><strong>{values[item.key] ?? 'Sample value'}</strong></div>)}</div>
    </FieldShell>
  }

  if (field.key === 'checkpointCard') {
    const values: Record<string, string> = { checkpointNumber: 'Checkpoint 01', cameraName: 'Lobby Camera 01', location: 'Main entrance · Ground floor', resultStatus: 'Clear — verified' }
    return <FieldShell field={field}>
      <div className="rb-preview-section-heading"><div><span className="rb-preview-kicker">CHECKPOINT DETAIL</span><h3>Guard House / Main Entrance</h3></div><span className="rb-preview-status-good"><CheckCircle2 size={13}/> Clear</span></div>
      <div className="rb-preview-meta-grid">{items.map((item) => <div className="rb-preview-meta" key={item.key}><span>{item.label}</span><strong>{values[item.key] ?? 'Verified'}</strong></div>)}</div>
      <div className="rb-preview-repeat-note">This section repeats for each checkpoint in the patrol.</div>
    </FieldShell>
  }

  if (field.key === 'evidence') {
    return <FieldShell field={field}><div className="rb-preview-section-heading"><div><span className="rb-preview-kicker">EVIDENCE</span><h3>Checkpoint Image / Evidence</h3></div></div><div className="rb-preview-evidence"><Camera size={26}/><span>Captured checkpoint image</span><small>Sample evidence preview</small></div></FieldShell>
  }

  if (field.key === 'checklist') {
    return <FieldShell field={field}><div className="rb-preview-section-heading"><div><span className="rb-preview-kicker">INSPECTION</span><h3>Checklist Results</h3></div></div>{selected('checklistName') && <p className="rb-preview-checklist-name">Common Area Check</p>}{selected('checklistResults') && <ul className="rb-preview-checklist"><li><CheckCircle2 size={14}/> Area clean and tidy</li><li><CheckCircle2 size={14}/> Emergency exits clear</li><li><CheckCircle2 size={14}/> CCTV coverage clear</li></ul>}</FieldShell>
  }

  if (field.key === 'issueStatus') {
    return <FieldShell field={field}><div className="rb-preview-section-heading"><div><span className="rb-preview-kicker">FOLLOW-UP</span><h3>Issue / Status</h3></div></div>{selected('issueFlag') && <div className="rb-preview-issue"><ShieldAlert size={15}/> No issue flagged for this checkpoint</div>}{selected('operatorComment') && <p className="rb-preview-comment">Operator comment: “Area checked and secure. No unusual activity observed.”</p>}</FieldShell>
  }

  return <FieldShell field={field}><h3>{field.label}</h3><p className="rb-preview-muted">{field.description}</p><div className="rb-preview-option-pills">{items.map((item) => <span key={item.key}>{item.label}</span>)}</div></FieldShell>
}

function SummaryFieldPreview({ field }: { field: TemplatePreviewField }) {
  const items = visibleItems(field)
  const has = (key: string) => enabled(field, key)

  if (field.key.startsWith('block-')) {
    if (field.variant === 'divider') return <FieldShell field={field}><div className="rb-preview-custom-divider" /></FieldShell>
    if (field.variant === 'spacer') return <FieldShell field={field}><div style={{ minHeight: field.height ?? 40 }} /></FieldShell>
    return <FieldShell field={field}><p className="rb-preview-custom-text">{field.text || 'Your custom text will appear here.'}</p></FieldShell>
  }

  if (field.key === 'header') {
    return <div className="rb-preview-header-shell" style={{ minHeight: field.height ? `${field.height}px` : undefined }}>
      <span className="rb-preview-size-tag">W {Math.round(field.previewWidth ?? 100)}% · H {field.height ? `${field.height}px min` : 'Auto'}</span>
      <div className="rb-preview-summary-header">
      {has('organizationLogo') && <div className="rb-preview-brand-mark">A</div>}
      <div className="rb-preview-header-copy">
        {has('reportTitle') && <><span className="rb-preview-eyebrow">A-FORCE PROTECTION</span><h1>Patrol Operations Summary</h1></>}
        <div className="rb-preview-summary-meta">{items.filter((i) => !['reportTitle', 'organizationLogo'].includes(i.key)).map((item) => {
          const values: Record<string, string> = { generatedTime: '04 Nov 2026, 10:30 AM', sitesCovered: '3 sites', operatorsCovered: '8 operators', reportPeriod: '01–04 November 2026' }
          return <span key={item.key}><b>{item.label}:</b> {values[item.key] ?? 'Sample'}</span>
        })}</div>
      </div>
      </div>
    </div>
  }

  if (field.key === 'statGrid') {
    const values: Record<string, [string, string]> = { patrols: ['Total patrols', '48'], completed: ['Completed patrols', '44'], checkpoints: ['Total checkpoints', '612'], issuesFlagged: ['Issues flagged', '7'] }
    return <FieldShell field={field}><div className="rb-preview-stat-grid">{items.map((item) => <div className="rb-preview-stat" key={item.key}><span>{values[item.key]?.[0] ?? item.label}</span><strong>{values[item.key]?.[1] ?? '—'}</strong><small>Sample metric</small></div>)}</div></FieldShell>
  }

  if (field.key === 'outcomesChart') {
    return <FieldShell field={field}><div className="rb-preview-section-heading"><h3>Checkpoint Outcomes</h3></div>{has('chartVisual') && <div className="rb-preview-donut-wrap"><div className="rb-preview-donut"><strong>92%</strong></div>{(has('clearLegend') || has('issuesLegend')) && <div className="rb-preview-legend">{has('clearLegend') && <span><i className="clear"/> 563 clear</span>}{has('issuesLegend') && <span><i className="flagged"/> 49 flagged</span>}</div>}</div>}</FieldShell>
  }

  if (field.key === 'issuesChart' || field.key === 'trendChart' || field.key === 'shiftChart') {
    const title = field.key === 'issuesChart' ? 'Issues by Route' : field.key === 'trendChart' ? 'Issues Over Time' : 'Issues by Shift'
    return <FieldShell field={field}><div className="rb-preview-section-heading"><h3>{has('chartTitle') ? title : ' '}</h3></div>{has('chartVisual') && <div className={`rb-preview-bars ${field.key}`}><div style={{ height: '38%' }}><span>Mon</span></div><div style={{ height: '72%' }}><span>Tue</span></div><div style={{ height: '48%' }}><span>Wed</span></div><div style={{ height: '86%' }}><span>Thu</span></div><div style={{ height: '58%' }}><span>Fri</span></div><div style={{ height: '28%' }}><span>Sat</span></div></div>}{field.key === 'shiftChart' && <div className="rb-preview-shift-stats">{has('nightShiftStats') && <span>Night shift · 4 issues</span>}{has('morningShiftStats') && <span>Morning shift · 3 issues</span>}</div>}</FieldShell>
  }

  if (field.key === 'routeTable' || field.key === 'operatorTable' || field.key === 'jobsTable') {
    const title = field.key === 'routeTable' ? 'By Route' : field.key === 'operatorTable' ? 'By Operator' : 'Included Patrols'
    const headers = items.filter((item) => item.key !== 'tableTitle').map((item) => item.label)
    const data = field.key === 'operatorTable'
      ? [['Alex Morgan', '12', '2'], ['Jamie Lee', '9', '1']]
      : field.key === 'jobsTable'
        ? [['A-Force Office', 'Main Office Patrol', 'Alex Morgan', '04 Nov, 10:20', '12', '0'], ['Kovan Residence', 'Perimeter Patrol', 'Jamie Lee', '04 Nov, 09:40', '18', '1']]
        : [['Main Office Patrol', '18', '216', '2'], ['Perimeter Patrol', '14', '184', '3']]
    return <FieldShell field={field}><div className="rb-preview-section-heading"><h3>{has('tableTitle') ? title : ' '}</h3></div><PreviewTable headers={headers} rows={data}/></FieldShell>
  }

  return <FieldShell field={field}><h3>{field.label}</h3><p className="rb-preview-muted">{field.description}</p><div className="rb-preview-option-pills">{items.map((item) => <span key={item.key}>{item.label}</span>)}</div></FieldShell>
}

export default function BuilderTemplatePreview({ kind, templateName, rows, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const title = templateName?.trim() || (kind === 'report' ? 'Untitled Patrol Report' : 'Untitled Summary Report')
  const getRowShares = (row: TemplatePreviewField[]) => {
    if (!row.length) return [] as number[]
    const used = row.reduce((sum, field) => sum + (field.width ?? 0), 0)
    const missing = row.filter((field) => field.width == null).length
    const fallback = missing ? Math.max(10, (100 - used) / missing) : 0
    const raw = row.map((field) => field.width ?? fallback)
    const total = raw.reduce((sum, value) => sum + value, 0) || 100
    return raw.map((value) => (value / total) * 100)
  }
  const getColumns = (row: TemplatePreviewField[]) =>
    getRowShares(row).map((share) => `minmax(0, ${share}fr)`).join(' ')

  return (
    <div className="rb-preview-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="rb-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="rb-preview-title">
        <header className="rb-preview-dialog-head">
          <div><span className="rb-preview-dialog-kicker">TEMPLATE PREVIEW</span><h2 id="rb-preview-title">{title}</h2><p>Preview of the current layout and selected content.</p></div>
          <button type="button" className="rb-preview-close" onClick={onClose} aria-label="Close template preview"><X size={18}/></button>
        </header>
        <div className="rb-preview-sample-note"><FileText size={14}/> Sample content is illustrative. The final report will use the selected patrol data.</div>
        <div className="rb-preview-scroll">
          <article className={`rb-preview-paper ${kind === 'summary' ? 'is-summary' : 'is-report'}`}>
            {rows.length ? rows.map((row, rowIndex) => (
              <div className="rb-preview-row" key={rowIndex} style={{ gridTemplateColumns: getColumns(row) }}>
                {row.map((field, fieldIndex) => {
                  const sizedField = { ...field, previewWidth: getRowShares(row)[fieldIndex] }
                  return <div className="rb-preview-column" key={field.key} style={{ minHeight: field.height ? `${field.height}px` : undefined }}>{kind === 'report' ? <ReportFieldPreview field={sizedField}/> : <SummaryFieldPreview field={sizedField}/>}</div>
                })}
              </div>
            )) : <div className="rb-preview-empty"><FileText size={32}/><h3>Your report layout is empty</h3><p>Add components in the builder to see them here.</p></div>}
            <footer className="rb-preview-paper-footer"><span>A-FORCE PROTECTION · VIRTUAL PATROL</span><span>PREVIEW COPY</span></footer>
          </article>
        </div>
      </section>
    </div>
  )
}
