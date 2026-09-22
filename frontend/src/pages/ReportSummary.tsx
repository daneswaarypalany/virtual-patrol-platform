import { useEffect, useState } from 'react'
import { BarChart3, FileText, Download } from 'lucide-react'
import SearchableSelect from '../components/SearchableSelect'
import type { PatrolJobSummary } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import ReportsFilterBar from '../components/ReportsFilterBar'
import { useReportFilters } from '../hooks/useReportFilters'
import type { SummaryReportTemplateSummary } from '../lib/summary-report-template'
import { summaryReportTemplateApi } from '../lib/summary-report-template'
import './ReportSummary.css'

export default function ReportSummary({
  jobs,
  loading,
  error,
}: {
  jobs: PatrolJobSummary[]
  loading: boolean
  error: string
}) {
  const f = useReportFilters(jobs)
  const { completed, filtered } = f
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [templates, setTemplates] = useState<SummaryReportTemplateSummary[]>([])
  const [templateId, setTemplateId] = useState<string>('')

  useEffect(() => {
    summaryReportTemplateApi
      .list()
      .then((list) => {
        setTemplates(list)
        const def = list.find((t) => t.isDefault)
        setTemplateId(def?.id ?? list[0]?.id ?? '')
      })
      .catch(() => {
        // template picker is a nice-to-have; generation still works with
        // the backend's own default if this list fails to load
      })
  }, [])

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—')
  const openReport = (jobId: string) => {
    window.open(patrolApi.reportUrl(jobId), '_blank')
  }

  const generateSummary = async () => {
    if (filtered.length === 0) return
    setGenerating(true)
    setGenError('')
    try {
      const blob = await patrolApi.summaryReport(
        filtered.map((j) => j.id),
        templateId || undefined,
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `patrol-summary-${Date.now()}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setGenError('Failed to generate summary. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="report-summary">
      <ReportsFilterBar
        f={f}
        searchPlaceholder="Search by route, site, or operator…"
        countLabel={`${filtered.length} reports`}
      />

      {error && <div className="reports-error">{error}</div>}
      {genError && <div className="reports-error">{genError}</div>}

      <div className="rs-generate-bar">
        <div className="rs-generate-info">
          <BarChart3 size={18} />
          <div>
            <strong>Summary covers {filtered.length} report{filtered.length === 1 ? '' : 's'}</strong>
            <span>
              Based on the filters above — adjust them to change what the
              summary includes. What the PDF contains is controlled by the
              Summary Report Builder.
            </span>
          </div>
        </div>
        <div className="rs-generate-actions">
          {templates.length > 0 && (
            <div className="rs-template-picker">
              <SearchableSelect
                value={templateId}
                onChange={(v) => setTemplateId(v)}
                placeholder="Select template…"
                searchable={false}
                disabled={generating}
                options={templates.map((t) => ({
                  value: t.id,
                  label: t.name,
                  sub: t.isDefault ? 'Default' : undefined,
                }))}
              />
            </div>
          )}
          <button
            className="rs-generate-btn"
            onClick={generateSummary}
            disabled={filtered.length === 0 || generating}
          >
            <Download size={14} />
            {generating ? 'Generating…' : 'Generate Summary PDF'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="reports-loading">Loading…</p>
      ) : completed.length === 0 ? (
        <div className="reports-empty">
          <FileText size={40} className="reports-empty-icon" />
          <p>No completed patrols yet. Reports appear here once a patrol is completed.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="reports-empty">
          <p>No reports match your filters.</p>
        </div>
      ) : (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Site</th>
                <th>Operator</th>
                <th>Completed</th>
                <th>Checkpoints</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.id} onClick={() => openReport(j.id)}>
                  <td className="report-route">{j.route.name}</td>
                  <td>{j.route.site.name}</td>
                  <td>{j.operator.fullName}</td>
                  <td>{fmt(j.completedAt)}</td>
                  <td>{j._count.results}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}