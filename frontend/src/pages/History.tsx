import { useEffect, useState } from 'react'
import { Calendar, AlertTriangle, Camera as CamIcon } from 'lucide-react'
import type { PatrolJobSummary, PatrolJob } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import './History.css'

type DatePreset = 'all' | 'today' | 'week' | 'month'

export default function History() {
  const [jobs, setJobs] = useState<PatrolJobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [preset, setPreset] = useState<DatePreset>('week')
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

  const cutoff = (() => {
    const now = new Date()
    if (preset === 'today') {
      const d = new Date(now)
      d.setHours(0, 0, 0, 0)
      return d
    }
    if (preset === 'week') {
      const d = new Date(now)
      d.setDate(d.getDate() - 7)
      return d
    }
    if (preset === 'month') {
      const d = new Date(now)
      d.setMonth(d.getMonth() - 1)
      return d
    }
    return null
  })()

  const visible = completed.filter((j) => {
    if (!cutoff) return true
    return new Date(j.completedAt!) >= cutoff
  })

  // group by day label
  const groups: { label: string; jobs: PatrolJobSummary[] }[] = []
  const dayKey = (iso: string) => new Date(iso).toDateString()
  const todayKey = new Date().toDateString()
  const yesterdayKey = new Date(Date.now() - 86400000).toDateString()

  const byDay = new Map<string, PatrolJobSummary[]>()
  for (const j of visible) {
    const k = dayKey(j.completedAt!)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(j)
  }
  // preserve newest-first order
  const seen = new Set<string>()
  for (const j of visible) {
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
    groups.push({ label, jobs: byDay.get(k)! })
  }

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

  const presets: { key: DatePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'all', label: 'All time' },
  ]

  return (
    <div className="history-page">
      <div className="history-presets">
        {presets.map((p) => (
          <button
            key={p.key}
            className={preset === p.key ? 'active' : ''}
            onClick={() => setPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error && <div className="history-error">{error}</div>}

      {loading ? (
        <p className="history-muted">Loading…</p>
      ) : groups.length === 0 ? (
        <div className="history-empty">
          <Calendar size={40} className="history-empty-icon" />
          <p>No patrols in this period.</p>
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="history-group">
            <h3 className="history-day">{g.label}</h3>

            {g.jobs.map((j) => (
              <div key={j.id} className="history-card">
                <button className="history-card-head" onClick={() => toggle(j.id)}>
                  <div>
                    <strong>{j.route.name}</strong>
                    <span className="history-card-meta">
                      {j.route.site.name} · {j.operator.fullName} ·{' '}
                      {new Date(j.completedAt!).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
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