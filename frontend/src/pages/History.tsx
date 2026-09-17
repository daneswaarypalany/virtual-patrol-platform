import { useEffect, useMemo, useRef, useState } from 'react'
import { Calendar, AlertTriangle, Camera as CamIcon } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import type { PatrolJobSummary, PatrolJob } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import SearchableSelect from '../components/SearchableSelect'
import TimeWheelPicker from '../components/TimeWheelPicker'
import './History.css'

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'
type SortKey = 'newest' | 'oldest' | 'site'
type ShiftKey = 'night' | 'morning'

const SHIFTS: { key: ShiftKey; label: string; from: string; to: string }[] = [
  { key: 'night', label: 'Night Shift (8:00 PM – 8:00 AM)', from: '20:00', to: '08:00' },
  { key: 'morning', label: 'Morning Shift (8:00 AM – 8:00 PM)', from: '08:00', to: '20:00' },
]

const presets: { key: DatePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'custom', label: 'Custom range' },
]

export default function History() {
  const [jobs, setJobs] = useState<PatrolJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [siteFilter, setSiteFilter] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')
  const [fromDate, setFromDate] = useState<Date | null>(null)
  const [toDate, setToDate] = useState<Date | null>(null)
  const [fromTime, setFromTime] = useState('')
  const [toTime, setToTime] = useState('')
  const [panelOpen, setPanelOpen] = useState(false)
  const panelWrapRef = useRef<HTMLDivElement>(null)

  const [expanded, setExpanded] = useState<string | null>(null)
  const [detail, setDetail] = useState<PatrolJob | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    patrolApi
      .listJobs()
      .then(setJobs)
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false))
  }, [])

  const completed = jobs.filter((j) => j.status === 'COMPLETED' && j.completedAt)

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
  // end date that many days/months/years later
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

  // close the refine panel on outside click
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
      const matchesSite = siteFilter === 'all' || j.route.site.name === siteFilter
      const when = j.completedAt ? new Date(j.completedAt) : null

      let matchesDate = true
      if (cutoff) matchesDate = !!when && when >= cutoff
      if (fromDate && when) matchesDate = matchesDate && when >= fromDate
      if (toDate && when) {
        const end = new Date(toDate)
        end.setHours(23, 59, 59, 999)
        matchesDate = matchesDate && when <= end
      }

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

      return matchesSite && matchesDate && matchesTime
    })

    list = [...list].sort((a, b) => {
      if (sortKey === 'site')
        return a.route.site.name.localeCompare(b.route.site.name)
      const at = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bt = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return sortKey === 'oldest' ? at - bt : bt - at
    })

    return list
  }, [completed, siteFilter, cutoff, fromDate, toDate, fromTime, toTime, sortKey])

  // day-grouping only makes sense while sorted by date — "by site" shows a
  // flat list instead so the site ordering isn't broken up into day buckets
  const groupByDay = sortKey !== 'site'

  const groups: { label: string; jobs: PatrolJobSummary[] }[] = useMemo(() => {
    if (!groupByDay) return [{ label: '', jobs: filtered }]

    const dayKey = (iso: string) => new Date(iso).toDateString()
    const todayKey = new Date().toDateString()
    const yesterdayKey = new Date(Date.now() - 86400000).toDateString()

    const byDay = new Map<string, PatrolJobSummary[]>()
    for (const j of filtered) {
      const k = dayKey(j.completedAt!)
      if (!byDay.has(k)) byDay.set(k, [])
      byDay.get(k)!.push(j)
    }
    const out: { label: string; jobs: PatrolJobSummary[] }[] = []
    const seen = new Set<string>()
    for (const j of filtered) {
      const k = dayKey(j.completedAt!)
      if (seen.has(k)) continue
      seen.add(k)
      let label = new Date(j.completedAt!).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
      if (k === todayKey) label = 'Today'
      else if (k === yesterdayKey) label = 'Yesterday'
      out.push({ label, jobs: byDay.get(k)! })
    }
    return out
  }, [filtered, groupByDay])

  const toggle = async (jobId: string) => {
    if (expanded === jobId) {
      setExpanded(null)
      setDetail(null)
      return
    }
    setExpanded(jobId)
    setDetail(null)
    setDetailLoading(true)
    try {
      setDetail(await patrolApi.getJob(jobId))
    } catch {
      setError('Failed to load patrol details')
    } finally {
      setDetailLoading(false)
    }
  }

  const fmtCardMeta = (j: PatrolJobSummary) => {
    const time = new Date(j.completedAt!).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
    if (groupByDay) return `${j.route.site.name} · ${j.operator.fullName} · ${time}`
    const date = new Date(j.completedAt!).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
    })
    return `${j.route.site.name} · ${j.operator.fullName} · ${date} · ${time}`
  }

  return (
    <div className="history-page">
      <div className="history-controls-row">
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

        <div className="history-filters">
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

      {error && <div className="history-error">{error}</div>}

      {loading ? (
        <p className="history-muted">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="history-empty">
          <Calendar size={40} className="history-empty-icon" />
          <p>No patrols in this period.</p>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.label || 'flat'} className="history-group">
            {g.label && <h3 className="history-day">{g.label}</h3>}

            {g.jobs.map((j) => (
              <div key={j.id} className="history-card">
                <button className="history-card-head" onClick={() => toggle(j.id)}>
                  <div>
                    <strong>{j.route.name}</strong>
                    <span className="history-card-meta">{fmtCardMeta(j)}</span>
                  </div>
                  <span className="history-toggle">
                    {expanded === j.id ? '−' : '+'}
                  </span>
                </button>

                {expanded === j.id && (
                  <div className="history-detail">
                    {detailLoading ? (
                      <p className="history-muted">Loading captures…</p>
                    ) : detail ? (
                      <>
                        {(() => {
                          const issues = detail.results.filter(
                            (r) => !r.allClear,
                          )
                          const withShots = detail.results.filter(
                            (r) => r.screenshotPath,
                          )
                          return (
                            <>
                              <div className="history-summary-row">
                                <span>
                                  <CamIcon size={13} /> {withShots.length}{' '}
                                  screenshots
                                </span>
                                <span
                                  className={issues.length ? 'has-issues' : ''}
                                >
                                  <AlertTriangle size={13} /> {issues.length}{' '}
                                  issues
                                </span>
                              </div>

                              {issues.length > 0 && (
                                <div className="history-issues">
                                  {issues.map((r) => {
                                    const cp = detail.route.checkpoints.find(
                                      (c) => c.id === r.checkpointId,
                                    )
                                    return (
                                      <div key={r.id} className="history-issue">
                                        <AlertTriangle size={14} />
                                        <div>
                                          <strong>
                                            {cp?.camera.name || 'Checkpoint'}
                                          </strong>
                                          <span>{r.comment}</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              <div className="history-gallery">
                                {withShots.map((r) => {
                                  const cp = detail.route.checkpoints.find(
                                    (c) => c.id === r.checkpointId,
                                  )
                                  return (
                                    <div
                                      key={r.id}
                                      className={`history-shot ${
                                        !r.allClear ? 'flagged' : ''
                                      }`}
                                    >
                                      <img
                                        src={`http://localhost:3000/uploads/${r.screenshotPath}`}
                                        alt={cp?.camera.name || 'capture'}
                                      />
                                      <span>{cp?.camera.name}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </>
                          )
                        })()}
                      </>
                    ) : (
                      <p className="history-muted">No details.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  )
}