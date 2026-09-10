import { useEffect, useState, useMemo, useRef } from 'react'
import { FileText, Download, Eye } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import type { PatrolJobSummary } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import ViewToggle, { type ViewMode } from '../components/ViewToggle'
import SearchableSelect from '../components/SearchableSelect'
import TimeWheelPicker from '../components/TimeWheelPicker'
import './Reports.css'

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'
type SortKey = 'newest' | 'oldest' | 'site'
type ShiftKey = 'night' | 'morning'

const SHIFTS: { key: ShiftKey; label: string; from: string; to: string }[] = [
  { key: 'night', label: 'Night Shift (8:00 PM – 8:00 AM)', from: '20:00', to: '08:00' },
  { key: 'morning', label: 'Morning Shift (8:00 AM – 8:00 PM)', from: '08:00', to: '20:00' },
]

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
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const panelWrapRef = useRef<HTMLDivElement>(null)

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

  const selectPreset = (key: DatePreset) => {
    setDatePreset(key)
    setFromDate(null)
    setToDate(null)
    setFromTime('')
    setToTime('')
    setPanelOpen(true)
  }

  // close the refine panel on outside click, but not on clicks within the
  // preset bar itself (those re-open it via selectPreset)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelOpen &&
        panelWrapRef.current &&
        !panelWrapRef.current.contains(e.target as Node)
      ) {
        setPanelOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [panelOpen])

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

      // date filter — a preset's cutoff sets the base window; the date
      // pickers in the panel below can further narrow within it (and are
      // the sole source of truth when the preset is "custom")
      let matchesDate = true
      if (cutoff) matchesDate = !!when && when >= cutoff
      if (fromDate && when) matchesDate = matchesDate && when >= fromDate
      if (toDate && when) {
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        matchesDate = matchesDate && when <= end
      }

      // time-of-day filter — applies for any preset once set, including a
      // shift shortcut (night/morning) or the plain time inputs
      let matchesTime = true
      if ((fromTime || toTime) && when) {
        const mins = when.getHours() * 60 + when.getMinutes()
        const toMins = (t: string) => {
          const [h, m] = t.split(':').map(Number)
          return h * 60 + m
        }
        const start = fromTime ? toMins(fromTime) : 0
        const end = toTime ? toMins(toTime) : 24 * 60
        if (start <= end) {
          matchesTime = mins >= start && mins <= end
        } else {
          matchesTime = mins >= start || mins <= end
        }
      }

      return matchesSearch && matchesSite && matchesDate && matchesTime
    })

    list = [...list].sort((a, b) => {
      if (sortKey === 'site')
        return a.route.site.name.localeCompare(b.route.site.name)
      const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return sortKey === 'oldest' ? at - bt : bt - at
    })

    return list
  }, [
    completed,
    search,
    siteFilter,
    cutoff,
    datePreset,
    fromDate,
    toDate,
    fromTime,
    toTime,
    sortKey,
  ])

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

      <div className="date-presets-wrap" ref={panelWrapRef}>
        <div className="date-presets">
          {presets.map((p) => (
            <button
              key={p.key}
              className={datePreset === p.key ? 'active' : ''}
              onClick={() => selectPreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {panelOpen && (
          <div className="custom-range-panel">
            {datePreset !== 'today' && (
              <>
                <div className="range-section">
                  <span className="range-title">Date range</span>
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
                      className="range-input"
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
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
                      className="range-input"
                      showMonthDropdown
                      showYearDropdown
                      dropdownMode="select"
                    />
                  </div>
                </div>

                <div className="range-divider" />
              </>
            )}

            <div className="range-section">
              <span className="range-title">Time of day</span>
              <div className="date-range-field">
                <label>From</label>
                <TimeWheelPicker value={fromTime} onChange={setFromTime} />
              </div>
              <div className="date-range-field">
                <label>To</label>
                <TimeWheelPicker value={toTime} onChange={setToTime} />
              </div>
            </div>

            <div className="range-divider" />

            <div className="range-section">
              <span className="range-title">Shift</span>
              <div className="shift-buttons">
                {SHIFTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={
                      fromTime === s.from && toTime === s.to ? 'active' : ''
                    }
                    onClick={() => {
                      setFromTime(s.from)
                      setToTime(s.to)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="range-panel-actions">
              {(fromDate || toDate || fromTime || toTime) && (
                <button
                  className="range-clear"
                  onClick={() => {
                    setFromDate(null)
                    setToDate(null)
                    setFromTime('')
                    setToTime('')
                  }}
                >
                  Clear all
                </button>
              )}
              <button
                className="range-cancel"
                onClick={() => setPanelOpen(false)}
              >
                Cancel
              </button>
              <button
                className="range-select"
                onClick={() => setPanelOpen(false)}
              >
                Select
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="reports-filters">
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