import { useEffect, useState } from 'react'
import {
  Camera,
  MapPin,
  MonitorDot,
  FileText,
  AlertTriangle,
  Activity,
  X,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { DashboardData, TimelineItem, IssueItem } from '../lib/dashboard'
import { dashboardApi } from '../lib/dashboard'
import { patrolApi } from '../lib/patrol'
import type { ActivePatrolItem } from '../lib/patrol'
import { camerasApi } from '../lib/cameras'
import type { Camera as CameraType } from '../lib/cameras'
import { useAuth } from '../auth/AuthContext'
import './Dashboard.css'

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [popup, setPopup] = useState<null | 'issues' | 'active' | 'cameras'>(
    null,
  )
  const [activeList, setActiveList] = useState<ActivePatrolItem[]>([])
  const [activeLoading, setActiveLoading] = useState(false)
  const [issueList, setIssueList] = useState<IssueItem[]>([])
  const [issueLoading, setIssueLoading] = useState(false)
  const [cameraList, setCameraList] = useState<CameraType[]>([])
  const [cameraLoading, setCameraLoading] = useState(false)
  const [tlFilter, setTlFilter] = useState<'all' | 'patrols' | 'issues'>('all')

  useEffect(() => {
    let cancelled = false

    const load = (isInitial: boolean) => {
      dashboardApi
        .get()
        .then((next) => {
          if (!cancelled) setData(next)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled && isInitial) setLoading(false)
        })
    }

    load(true)
    const interval = setInterval(() => load(false), 15000)
    const onFocus = () => load(false)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  const openIssues = async () => {
    setPopup('issues')
    setIssueLoading(true)
    try {
      setIssueList(await dashboardApi.listIssues())
    } catch {
      setIssueList([])
    } finally {
      setIssueLoading(false)
    }
  }

  const openActive = async () => {
    setPopup('active')
    setActiveLoading(true)
    try {
      setActiveList(await patrolApi.listActive())
    } catch {
      setActiveList([])
    } finally {
      setActiveLoading(false)
    }
  }

  const openCameras = async () => {
    setPopup('cameras')
    setCameraLoading(true)
    try {
      setCameraList(await camerasApi.list())
    } catch {
      setCameraList([])
    } finally {
      setCameraLoading(false)
    }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    const diff = Math.round((Date.now() - d.getTime()) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff} min ago`
    if (diff < 1440) return `${Math.round(diff / 60)} h ago`
    return d.toLocaleDateString()
  }

  const dotClass = (t: TimelineItem['type']) =>
    t === 'issue' ? 'tl-issue' : t === 'completed' ? 'tl-done' : 'tl-progress'
  const icon = (t: TimelineItem['type']) =>
    t === 'issue' ? '⚠' : t === 'completed' ? '✓' : '▶'

  const s = data?.stats

  const ACTIVE_PATROLS_TOTAL = 50
  const ISSUES_FLAGGED_TOTAL = 100

  const donut = [
    { name: 'Issues', value: s?.issuesFlagged ?? 0, color: '#cf5b5b' },
    {
      name: 'Clear',
      value:
        Math.max(0, ISSUES_FLAGGED_TOTAL - (s?.issuesFlagged ?? 0)) || 1,
      color: '#e5ecf3',
    },
  ]

  const activeDonut = [
    { name: 'Active', value: s?.activePatrols ?? 0, color: '#2e9e6b' },
    {
      name: 'Idle',
      value:
        Math.max(0, ACTIVE_PATROLS_TOTAL - (s?.activePatrols ?? 0)) || 1,
      color: '#e5ecf3',
    },
  ]

  return (
    <div className="dash">
      {/* Hero header */}
      <div className="dash-hero">
        <div>
          <h2>Welcome back, {user?.fullName?.split(' ')[0]} 👋</h2>
          <p>Here's what's happening across your patrol operations today.</p>
        </div>
        <div className="dash-online">
          <span className="dot" /> System Online
        </div>
      </div>

      {/* Stat cards */}
      <div className="dash-stats">
        {/* Cameras — clickable */}
        <div className="dash-card dash-card-clickable" onClick={openCameras}>
          <div className="dash-card-top">
            <div className="dash-ico ico-blue">
              <Camera size={18} />
            </div>
          </div>
          <strong className="dash-value">
            {loading ? '—' : s?.cameras ?? 0}
          </strong>
          <span className="dash-label">Cameras</span>
          <span className="dash-sub">Click to view by site</span>
        </div>

        {/* Active Patrols — infographic + clickable */}
        <div
          className="dash-card dash-card-clickable dash-card-chart"
          onClick={openActive}
        >
          <div className="dash-chart-ring">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={activeDonut}
                  dataKey="value"
                  innerRadius={28}
                  outerRadius={40}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {activeDonut.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="dash-chart-center green-center">
              <MonitorDot size={15} />
            </div>
          </div>
          <div className="dash-chart-info">
            <strong className="dash-value">
              {loading ? '—' : `${s?.activePatrols ?? 0}/${ACTIVE_PATROLS_TOTAL}`}
            </strong>
            <span className="dash-label">Active Patrols</span>
            <span className="dash-sub">Click to view details</span>
          </div>
        </div>

        {/* Issues — infographic + clickable */}
        <div
          className="dash-card dash-card-clickable dash-card-chart"
          onClick={openIssues}
        >
          <div className="dash-chart-ring">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donut}
                  dataKey="value"
                  innerRadius={28}
                  outerRadius={40}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  {donut.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="dash-chart-center">
              <AlertTriangle size={15} />
            </div>
          </div>
          <div className="dash-chart-info">
            <strong className="dash-value">
              {loading ? '—' : `${s?.issuesFlagged ?? 0}/${ISSUES_FLAGGED_TOTAL}`}
            </strong>
            <span className="dash-label">Issues Flagged</span>
            <span className="dash-sub">Click to view details</span>
          </div>
        </div>

        {/* Completed Today */}
        <div className="dash-card">
          <div className="dash-card-top">
            <div className="dash-ico ico-navy">
              <FileText size={18} />
            </div>
          </div>
          <strong className="dash-value">
            {loading ? '—' : s?.completedToday ?? 0}
          </strong>
          <span className="dash-label">Completed Today</span>
          <span className="dash-sub">Patrols finished today</span>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="dash-panel">
        <div className="dash-panel-head">
          <h3>
            <Activity size={16} /> Recent Activity
          </h3>
          <div className="tl-filter">
            <button
              className={tlFilter === 'all' ? 'active' : ''}
              onClick={() => setTlFilter('all')}
            >
              All
            </button>
            <button
              className={tlFilter === 'patrols' ? 'active' : ''}
              onClick={() => setTlFilter('patrols')}
            >
              Patrols
            </button>
            <button
              className={tlFilter === 'issues' ? 'active' : ''}
              onClick={() => setTlFilter('issues')}
            >
              Issues
            </button>
          </div>
        </div>

        {loading ? (
          <p className="tl-loading">Loading…</p>
        ) : (
          (() => {
            const items = (data?.timeline ?? []).filter((item) => {
              if (tlFilter === 'all') return true
              if (tlFilter === 'issues') return item.type === 'issue'
              return item.type !== 'issue'
            })
            if (items.length === 0) {
              return <p className="tl-empty">No activity for this filter.</p>
            }
            return (
              <div className="timeline">
                {items.map((item, i) => (
                  <div key={i} className="tl-item">
                    <div className={`tl-dot ${dotClass(item.type)}`}>
                      {icon(item.type)}
                    </div>
                    <div className="tl-body">
                      <div className="tl-top">
                        <strong>{item.title}</strong>
                        <span className="tl-time">{fmt(item.at)}</span>
                      </div>
                      <p>{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          })()
        )}
      </div>

      {/* Issues popup */}
      {popup === 'issues' && (
        <div className="dash-popup-backdrop" onClick={() => setPopup(null)}>
          <div className="dash-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dash-popup-head">
              <h3>
                <AlertTriangle size={18} /> Flagged Issues
              </h3>
              <button onClick={() => setPopup(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dash-popup-body">
              {issueLoading ? (
                <p className="tl-empty">Loading…</p>
              ) : issueList.length === 0 ? (
                <p className="tl-empty">No flagged issues.</p>
              ) : (
                issueList.map((it) => (
                  <div key={it.id} className="popup-issue">
                    <AlertTriangle size={15} />
                    <div>
                      <strong>{it.checkpoint.camera.name}</strong>
                      <span>
                        {it.job.route.site.name} · {it.job.operator.fullName}
                        {it.comment ? ` — ${it.comment}` : ''}
                      </span>
                      <span className="popup-issue-time">
                        {fmt(it.completedAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active patrols popup */}
      {popup === 'active' && (
        <div className="dash-popup-backdrop" onClick={() => setPopup(null)}>
          <div className="dash-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dash-popup-head">
              <h3>
                <MonitorDot size={18} /> Active Patrols
              </h3>
              <button onClick={() => setPopup(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dash-popup-body">
              {activeLoading ? (
                <p className="tl-empty">Loading…</p>
              ) : activeList.length === 0 ? (
                <p className="tl-empty">No active patrols right now.</p>
              ) : (
                activeList.map((a) => (
                  <div key={a.id} className="popup-active">
                    <div
                      className={`popup-active-dot ${
                        a.status === 'DRAFT' ? 'draft' : ''
                      }`}
                    />
                    <div>
                      <strong>{a.route.name}</strong>
                      <span>
                        {a.route.site.name} · {a.operator.fullName} ·{' '}
                        {a._count.results} checkpoints done
                      </span>
                      <span className="popup-active-status">
                        {a.status === 'DRAFT' ? 'Draft' : 'In progress'}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cameras popup */}
      {popup === 'cameras' && (
        <div className="dash-popup-backdrop" onClick={() => setPopup(null)}>
          <div className="dash-popup" onClick={(e) => e.stopPropagation()}>
            <div className="dash-popup-head">
              <h3>
                <Camera size={18} /> Cameras by Site
              </h3>
              <button onClick={() => setPopup(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="dash-popup-body">
              {cameraLoading ? (
                <p className="tl-empty">Loading…</p>
              ) : cameraList.length === 0 ? (
                <p className="tl-empty">No cameras yet.</p>
              ) : (
                (() => {
                  const bySite = new Map<string, CameraType[]>()
                  for (const c of cameraList) {
                    const site = c.site?.name ?? 'Unassigned'
                    if (!bySite.has(site)) bySite.set(site, [])
                    bySite.get(site)!.push(c)
                  }
                  return Array.from(bySite.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([site, cams]) => (
                      <div key={site} className="popup-cam-group">
                        <div className="popup-cam-site">
                          {site} <span>{cams.length}</span>
                        </div>
                        {cams.map((c) => (
                          <div key={c.id} className="popup-cam">
                            <Camera size={14} />
                            <div>
                              <strong>{c.name}</strong>
                              <span>
                                {c.cameraCode} · {c.location || 'No location'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}