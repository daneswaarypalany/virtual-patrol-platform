import { useEffect, useState, useMemo, useRef } from 'react'
import { FileText, Download, X, FileArchive, FileStack } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import type { PatrolJobSummary } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
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
  const [fromDate, setFromDate] = useState<Date | null>(null)
  const [toDate, setToDate] = useState<Date | null>(null)
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const panelWrapRef = useRef<HTMLDivElement>(null)
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

  // for the week/month/year presets, picking a start date auto-fills the
  // end date that many days/months/years later, so the user only has to
  // pick one date instead of manually working out the range
  const computePresetEnd = (start: Date, preset: DatePreset) => {
    const end = new Date(start)
    if (preset === 'week') {
      end.setDate(end.getDate() + 6)
    } else if (preset === 'month') {
      end.setMonth(end.getMonth() + 1)
      end.setDate(end.getDate() - 1)
    } else if (preset === 'year') {
      end.setFullYear(end.getFullYear() + 1)
      end.setDate(end.getDate() - 1)
    }
    return end
  }

  const handleFromDateChange = (d: Date | null) => {
    setFromDate(d)
    if (d && (datePreset === 'week' || datePreset === 'month' || datePreset === 'year')) {
      setToDate(computePresetEnd(d, datePreset))
    } else if (!d) {
      setToDate(null)
    }
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
          <p className="reports-count">{filtered.length} reports</p>
        </div>
      </div>

      <div className="reports-controls-row">
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
                      onChange={handleFromDateChange}
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
                    <label>
                      To
                      {(datePreset === 'week' ||
                        datePreset === 'month' ||
                        datePreset === 'year') && (
                        <span className="range-auto-hint"> (auto)</span>
                      )}
                    </label>
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
      </div>

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
    </div>
  )
}