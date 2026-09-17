import { useEffect, useState } from 'react'
import { FileText, Download, X, FileArchive, FileStack, FileCog, BarChart3 } from 'lucide-react'
import type { PatrolJobSummary } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import ReportsFilterBar from '../components/ReportsFilterBar'
import { useReportFilters } from '../hooks/useReportFilters'
import ReportBuilder from './ReportBuilder'
import Templates from './Templates'
import ReportSummary from './ReportSummary'
import './Reports.css'

type ReportsTab = 'list' | 'summary' | 'builder' | 'templates'

export default function Reports() {
  const [tab, setTab] = useState<ReportsTab>('list')
  const [jobs, setJobs] = useState<PatrolJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState<'pdf' | 'zip' | null>(null)
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    patrolApi
      .listJobs()
      .then(setJobs)
      .catch(() => setError('Failed to load reports'))
      .finally(() => setLoading(false))
  }, [])

  const f = useReportFilters(jobs)
  const { completed, filtered } = f

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—')
  const openReport = (jobId: string) => {
    window.open(patrolApi.reportUrl(jobId), '_blank')
  }

  const toggleSelected = (jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((j) => selected.has(j.id))

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allFilteredSelected) {
        // only clear the ones currently visible under the active filters
        const next = new Set(prev)
        filtered.forEach((j) => next.delete(j.id))
        return next
      }
      const next = new Set(prev)
      filtered.forEach((j) => next.add(j.id))
      return next
    })
  }

  const clearSelection = () => setSelected(new Set())

  const downloadSelected = async (format: 'pdf' | 'zip') => {
    if (selected.size === 0) return
    setDownloading(format)
    setDownloadError('')
    try {
      const blob = await patrolApi.bulkReport(Array.from(selected), format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `patrol-reports-${Date.now()}.${format === 'pdf' ? 'pdf' : 'zip'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDownloadError('Failed to download reports. Please try again.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="reports-page">
      <div className="reports-tabs">
        <button
          className={tab === 'list' ? 'active' : ''}
          onClick={() => setTab('list')}
        >
          <FileText size={15} /> Generated Reports
        </button>
        <button
          className={tab === 'builder' ? 'active' : ''}
          onClick={() => setTab('builder')}
        >
          <FileCog size={15} /> Report Builder
        </button>
        <button
          className={tab === 'templates' ? 'active' : ''}
          onClick={() => setTab('templates')}
        >
          <FileStack size={15} /> Templates
        </button>
        <button
          className={tab === 'summary' ? 'active' : ''}
          onClick={() => setTab('summary')}
        >
          <BarChart3 size={15} /> Report Summary
        </button>
      </div>

      {tab === 'builder' ? (
        <ReportBuilder />
      ) : tab === 'templates' ? (
        <Templates onEdit={() => setTab('builder')} />
      ) : tab === 'summary' ? (
        <ReportSummary jobs={jobs} loading={loading} error={error} />
      ) : (
        <>
          <ReportsFilterBar f={f} countLabel={`${filtered.length} reports`} />

          {error && <div className="reports-error">{error}</div>}
          {downloadError && <div className="reports-error">{downloadError}</div>}

          {selected.size > 0 && (
            <div className="reports-selection-bar">
              <span>{selected.size} selected</span>
              <div className="reports-selection-actions">
                <button
                  className="selection-clear"
                  onClick={clearSelection}
                  disabled={downloading !== null}
                >
                  <X size={14} /> Clear
                </button>
                <button
                  className="selection-download"
                  onClick={() => downloadSelected('zip')}
                  disabled={downloading !== null}
                >
                  <FileArchive size={14} />
                  {downloading === 'zip' ? 'Zipping…' : 'Download as ZIP'}
                </button>
                <button
                  className="selection-download primary"
                  onClick={() => downloadSelected('pdf')}
                  disabled={downloading !== null}
                >
                  <FileStack size={14} />
                  {downloading === 'pdf' ? 'Merging…' : 'Download as one PDF'}
                </button>
              </div>
            </div>
          )}

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
                    <th className="report-select-col">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all reports"
                      />
                    </th>
                    <th>Route</th>
                    <th>Site</th>
                    <th>Operator</th>
                    <th>Completed</th>
                    <th>Checkpoints</th>
                    <th>Download</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((j) => (
                    <tr
                      key={j.id}
                      className={selected.has(j.id) ? 'row-selected' : ''}
                      onClick={() => openReport(j.id)}
                    >
                      <td
                        className="report-select-col"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(j.id)}
                          onChange={() => toggleSelected(j.id)}
                          aria-label={`Select report for ${j.route.name}`}
                        />
                      </td>
                      <td className="report-route">{j.route.name}</td>
                      <td>{j.route.site.name}</td>
                      <td>{j.operator.fullName}</td>
                      <td>{fmt(j.completedAt)}</td>
                      <td>{j._count.results}</td>
                      <td
                        className="report-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a
                          href={patrolApi.reportUrl(j.id)}
                          download
                          className="report-download"
                        >
                          <Download size={14} /> PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}