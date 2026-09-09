import { useEffect, useState, useMemo } from 'react'
import { FileText, Download, Eye } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import type { PatrolJobSummary } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import ViewToggle, { type ViewMode } from '../components/ViewToggle'
import './Reports.css'
import SearchableSelect from '../components/SearchableSelect'

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'
type SortKey = 'newest' | 'oldest' | 'site'

export default function Reports() {
  const [jobs, setJobs] = useState<PatrolJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [view, setView] = useState<ViewMode>('list')
  const [fromDate, setFromDate] = useState<Date | null>(null)
  const [toDate, setToDate] = useState<Date | null>(null)

  useEffect(() => {
    patrolApi
      .listJobs()
      .then(setJobs)
      .catch(() => setError('Failed to load reports'))
      .finally(() => setLoading(false))
  }, [])

  const completed = jobs.filter((j) => j.status === 'COMPLETED')

  const sites = useMemo(
    () => Array.from(new Set(completed.map((j) => j.route.site.name))).sort(),
    [completed],
  )

  // preset cutoff (for the non-custom presets)
  const cutoff = useMemo(() => {
    const now = new Date()
    if (datePreset === 'today') {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    if (datePreset === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return d
    }
    if (datePreset === 'month') {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      return d
    }
    if (datePreset === 'year') {
      const d = new Date(now)
      d.setFullYear(d.getFullYear() - 1)
      return d
    }
    return null
  }, [datePreset])

  const filtered = useMemo(() => {
    let list = completed.filter((j) => {
      const q = search.toLowerCase()
      const matchesSearch =
        j.route.name.toLowerCase().includes(q) ||
        j.route.site.name.toLowerCase().includes(q) ||
        j.operator.fullName.toLowerCase().includes(q)
      const matchesSite =
        siteFilter === 'all' || j.route.site.name === siteFilter

      const when = j.completedAt ? new Date(j.completedAt) : null
      let matchesDate = true
      if (datePreset === 'custom') {
        if (fromDate && when) matchesDate = when >= fromDate
        if (toDate && when && matchesDate) {
          // include the whole 'to' day
          const end = new Date(toDate)
          end.setHours(23, 59, 59, 999)
          matchesDate = when <= end
        }
      } else if (cutoff) {
        matchesDate = !!when && when >= cutoff
      }

      return matchesSearch && matchesSite && matchesDate
    })

    list = [...list].sort((a, b) => {
      if (sortKey === 'site')
        return a.route.site.name.localeCompare(b.route.site.name)
      const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return sortKey === 'oldest' ? at - bt : bt - at
    })

    return list
  }, [completed, search, siteFilter, cutoff, datePreset, fromDate, toDate, sortKey])

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : '—')
  const openReport = (jobId: string) => {
    window.open(patrolApi.reportUrl(jobId), '_blank')
  }

  const presets: { key: DatePreset; label: string }[] = [
    { key: 'all', label: 'All time' },
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'year', label: 'This year' },
    { key: 'custom', label: 'Custom range' },
  ]

  return (
    <div className="reports-page">
      <div className="reports-toolbar">
        <input
          className="reports-search"
          placeholder="Search by route, site, or operator…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="toolbar-right">
          <ViewToggle mode={view} onChange={setView} />
          <p className="reports-count">{filtered.length} reports</p>
        </div>
      </div>

      <div className="reports-filters">
        <div className="date-presets">
          {presets.map((p) => (
            <button
              key={p.key}
              className={datePreset === p.key ? 'active' : ''}
              onClick={() => setDatePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

         <div className="filter-selects">
          <div className="filter-select-w">
            <SearchableSelect
              value={siteFilter}
              onChange={(v) => setSiteFilter(v)}
              placeholder="All sites"
              options={[
                { value: 'all', label: 'All sites' },
                ...sites.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>

          <div className="filter-select-w">
            <SearchableSelect
              value={sortKey}
              onChange={(v) => setSortKey(v as SortKey)}
              placeholder="Sort"
              searchable={false}
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'oldest', label: 'Oldest first' },
                { value: 'site', label: 'By site' },
              ]}
            />
          </div>
        </div>
      </div>

      {datePreset === 'custom' && (
        <div className="date-range-row">
          <div className="date-range-field">
            <label>From</label>
            <DatePicker
              selected={fromDate}
              onChange={(d) => setFromDate(d)}
              selectsStart
              startDate={fromDate}
              endDate={toDate}
              placeholderText="Start date"
              dateFormat="dd MMM yyyy"
              className="date-input"
            />
          </div>
          <div className="date-range-field">
            <label>To</label>
            <DatePicker
              selected={toDate}
              onChange={(d) => setToDate(d)}
              selectsEnd
              startDate={fromDate}
              endDate={toDate}
              minDate={fromDate ?? undefined}
              placeholderText="End date"
              dateFormat="dd MMM yyyy"
              className="date-input"
            />
          </div>
          {(fromDate || toDate) && (
            <button
              className="date-clear"
              onClick={() => {
                setFromDate(null)
                setToDate(null)
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      {error && <div className="reports-error">{error}</div>}

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
      ) : view === 'list' ? (
        <div className="reports-table-wrap">
          <table className="reports-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>Site</th>
                <th>Operator</th>
                <th>Completed</th>
                <th>Checkpoints</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((j) => (
                <tr key={j.id}>
                  <td className="report-route">{j.route.name}</td>
                  <td>{j.route.site.name}</td>
                  <td>{j.operator.fullName}</td>
                  <td>{fmt(j.completedAt)}</td>
                  <td>{j._count.results}</td>
                  <td className="report-actions">
                    <button onClick={() => openReport(j.id)}>
                      <Eye size={14} /> View
                    </button>
                    <a href={patrolApi.reportUrl(j.id)} download className="report-download"><Download size={14} /> PDF</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="reports-grid">
          {filtered.map((j) => (
            <div key={j.id} className="report-card">
              <div className="report-card-head">
                <FileText size={18} className="report-card-icon" />
                <strong>{j.route.name}</strong>
              </div>
              <p className="report-card-site">{j.route.site.name}</p>
              <div className="report-card-meta">
                <span>{j.operator.fullName}</span>
                <span>{fmt(j.completedAt)}</span>
                <span>{j._count.results} checkpoints</span>
              </div>
              <div className="report-card-actions">
                <button onClick={() => openReport(j.id)}>
                  <Eye size={14} /> View
                </button>
                <a href={patrolApi.reportUrl(j.id)} download className="report-download"><Download size={14} /> PDF</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}