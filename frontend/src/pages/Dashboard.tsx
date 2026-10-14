import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Image as ImageIcon,
  MapPin,
  MonitorDot,
  Route as RouteIcon,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DashboardData, TimelineItem, IssueItem } from '../lib/dashboard'
import { dashboardApi } from '../lib/dashboard'
import { API_BASE_URL } from '../lib/api'
import { patrolApi } from '../lib/patrol'
import type { ActivePatrolItem } from '../lib/patrol'
import { camerasApi } from '../lib/cameras'
import type { Camera as CameraType } from '../lib/cameras'
import { useAuth } from '../auth/AuthContext'
import './Dashboard.css'

type DashboardPage = 'cameras' | 'routes' | 'patrol' | 'reports' | 'logs'
type PopupType = 'issues' | 'active' | 'cameras' | null

interface DashboardProps {
  onNavigate: (page: DashboardPage) => void
}

interface QuickAccessItem {
  title: string
  description: string
  icon: LucideIcon
  onClick: () => void
  meta?: string
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [popup, setPopup] = useState<PopupType>(null)
  const [activeList, setActiveList] = useState<ActivePatrolItem[]>([])
  const [activeLoading, setActiveLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [activePaused, setActivePaused] = useState(false)
  const [issueList, setIssueList] = useState<IssueItem[]>([])
  const [issueLoading, setIssueLoading] = useState(false)
  const [cameraList, setCameraList] = useState<CameraType[]>([])
  const [cameraLoading, setCameraLoading] = useState(false)
  const [tlFilter, setTlFilter] = useState<'all' | 'patrols' | 'issues'>('all')
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const touchStartX = useRef<number | null>(null)

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
    const interval = window.setInterval(() => load(false), 15000)
    const onFocus = () => load(false)
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Load live patrols for the dashboard carousel and refresh them with the stats.
  useEffect(() => {
    let cancelled = false

    const loadActive = async (initial = false) => {
      try {
        const next = await patrolApi.listActive()
        if (!cancelled) {
          setActiveList(next)
          setActiveIndex((current) => (next.length ? current % next.length : 0))
        }
      } catch {
        if (!cancelled) setActiveList([])
      } finally {
        if (!cancelled && initial) setActiveLoading(false)
      }
    }

    void loadActive(true)
    const interval = window.setInterval(() => void loadActive(), 15000)
    const onFocus = () => void loadActive()
    window.addEventListener('focus', onFocus)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  // Respect the system's reduced-motion preference and pause auto-advance while
  // a user is hovering/focusing the carousel.
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (activeList.length < 2 || activePaused || reducedMotion) return
    const interval = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % activeList.length)
    }, 5500)
    return () => window.clearInterval(interval)
  }, [activeList.length, activePaused, reducedMotion])

  useEffect(() => {
    if (!popup) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPopup(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [popup])

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
      const next = await patrolApi.listActive()
      setActiveList(next)
      setActiveIndex((current) => (next.length ? current % next.length : 0))
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
    if (Number.isNaN(d.getTime())) return 'Recently'
    const diff = Math.round((Date.now() - d.getTime()) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff} min ago`
    if (diff < 1440) return `${Math.round(diff / 60)} h ago`
    return d.toLocaleDateString()
  }

  const screenshotUrl = (path: string) => {
    const normalized = path.replace(/^\/+/, '').replace(/^uploads\//, '')
    return `${API_BASE_URL.replace(/\/+$/, '')}/uploads/${normalized}`
  }

  const dotClass = (t: TimelineItem['type']) =>
    t === 'issue' ? 'tl-issue' : t === 'completed' ? 'tl-done' : 'tl-progress'
  const timelineIcon = (t: TimelineItem['type']) =>
    t === 'issue' ? '!' : t === 'completed' ? '✓' : '▶'

  const moveActive = (direction: -1 | 1) => {
    if (activeList.length < 2) return
    setActiveIndex((current) => (current + direction + activeList.length) % activeList.length)
  }

  const currentActive = activeList.length ? activeList[activeIndex % activeList.length] : null
  const s = data?.stats

  const quickAccessItems: QuickAccessItem[] =
    user?.role === 'ADMIN'
      ? [
          { title: 'Camera directory', description: 'View cameras by site', icon: Camera, onClick: () => onNavigate('cameras'), meta: `${s?.cameras ?? 0} cameras` },
          { title: 'Patrol routes', description: 'Open the patrol route workspace', icon: RouteIcon, onClick: () => onNavigate('routes') },
          { title: 'Issue register', description: 'Review flagged issues and evidence', icon: AlertTriangle, onClick: openIssues, meta: `${s?.issuesFlagged ?? 0} flagged` },
        ]
      : user?.role === 'OPERATOR'
        ? [
            { title: 'Run patrol', description: 'Open your patrol workspace', icon: MonitorDot, onClick: () => onNavigate('patrol') },
            { title: 'Generated reports', description: 'Review patrol report downloads', icon: FileText, onClick: () => onNavigate('reports') },
            { title: 'Issue register', description: 'Review flagged issues and evidence', icon: AlertTriangle, onClick: openIssues, meta: `${s?.issuesFlagged ?? 0} flagged` },
          ]
        : [
            { title: 'Generated reports', description: 'Review available patrol reports', icon: FileText, onClick: () => onNavigate('reports') },
            { title: 'Active patrols', description: 'View patrols currently in progress', icon: MonitorDot, onClick: openActive, meta: `${s?.activePatrols ?? 0} active` },
            { title: 'Issue register', description: 'Review flagged issues and evidence', icon: AlertTriangle, onClick: openIssues, meta: `${s?.issuesFlagged ?? 0} flagged` },
          ]

  return (
    <div className="dash">
      <div className="dash-hero">
        <div>
          <p className="dash-eyebrow">OPERATIONS OVERVIEW</p>
          <h2>Welcome back, {user?.fullName?.split(' ')[0] ?? 'there'}</h2>
          <p>Here's what's happening across your patrol operations today.</p>
        </div>
        <div className="dash-online"><span className="dot" /> System Online</div>
      </div>

      <div className="dash-stats">
        <button type="button" className="dash-card dash-card-clickable" onClick={openCameras}>
          <div className="dash-card-top">
            <span className="dash-label">Cameras</span>
            <span className="dash-ico ico-blue"><Camera size={17} /></span>
          </div>
          <strong className="dash-value">{loading ? '—' : s?.cameras ?? 0}</strong>
          <span className="dash-sub">Click to view by site</span>
          <ArrowUpRight className="dash-card-arrow" size={16} />
        </button>

        <button type="button" className="dash-card dash-card-clickable dash-card-patrol-hover" onClick={openActive}>
          <div className="dash-card-top">
            <span className="dash-label">Active Patrols</span>
            <span className="dash-ico ico-navy"><MonitorDot size={17} /></span>
          </div>
          <strong className="dash-value">{loading ? '—' : s?.activePatrols ?? 0}</strong>
          <span className="dash-sub">Click to view details</span>
          <ArrowUpRight className="dash-card-arrow" size={16} />
        </button>

        <button type="button" className="dash-card dash-card-clickable" onClick={openIssues}>
          <div className="dash-card-top">
            <span className="dash-label">Issues Flagged</span>
            <span className="dash-ico ico-red"><AlertTriangle size={17} /></span>
          </div>
          <strong className="dash-value">{loading ? '—' : s?.issuesFlagged ?? 0}</strong>
          <span className="dash-sub">Click to view details</span>
          <ArrowUpRight className="dash-card-arrow" size={16} />
        </button>

        <div className="dash-card">
          <div className="dash-card-top">
            <span className="dash-label">Completed Today</span>
            <span className="dash-ico ico-navy"><FileText size={17} /></span>
          </div>
          <strong className="dash-value">{loading ? '—' : s?.completedToday ?? 0}</strong>
          <span className="dash-sub">Patrols finished today</span>
        </div>
      </div>

      <div className="dash-main-grid">
        <section className="dash-panel dash-activity-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">
              <h3><Activity size={16} /> Recent Activity</h3>
              <span className="tl-window-label">Last 24 hours</span>
            </div>
            <div className="tl-filter" role="group" aria-label="Filter recent activity">
              <button type="button" className={tlFilter === 'all' ? 'active' : ''} onClick={() => setTlFilter('all')}>All</button>
              <button type="button" className={tlFilter === 'patrols' ? 'active' : ''} onClick={() => setTlFilter('patrols')}>Patrols</button>
              <button type="button" className={tlFilter === 'issues' ? 'active' : ''} onClick={() => setTlFilter('issues')}>Issues</button>
            </div>
          </div>

          {loading ? <p className="tl-loading">Loading activity…</p> : (() => {
            const now = Date.now()
            const cutoff = now - 24 * 60 * 60 * 1000
            const items = (data?.timeline ?? [])
              .filter((item) => {
                const eventTime = new Date(item.at).getTime()
                if (!Number.isFinite(eventTime) || eventTime < cutoff || eventTime > now) return false
                if (tlFilter === 'issues') return item.type === 'issue'
                if (tlFilter === 'patrols') return item.type !== 'issue'
                return true
              })
              .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
            if (items.length === 0) return <p className="tl-empty">No activity recorded in the last 24 hours for this filter.</p>
            return <div className="timeline" aria-label="Activity from the last 24 hours">
              {items.map((item, i) => (
                <div key={`${item.at}-${item.title}-${i}`} className="tl-item">
                  <div className={`tl-dot ${dotClass(item.type)}`}>{timelineIcon(item.type)}</div>
                  <div className="tl-body">
                    <div className="tl-top"><strong>{item.title}</strong><span className="tl-time">{fmt(item.at)}</span></div>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          })()}

          <div className="dash-panel-foot">
            <span>ROLLING 24-HOUR WINDOW · PATROL & ISSUE EVENTS</span>
            <button type="button" onClick={() => onNavigate(user?.role === 'ADMIN' ? 'logs' : 'reports')}>View all activity <ArrowUpRight size={14} /></button>
          </div>
        </section>

        <section
          className="dash-active-panel"
          onMouseEnter={() => setActivePaused(true)}
          onMouseLeave={() => setActivePaused(false)}
          onFocusCapture={() => setActivePaused(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setActivePaused(false)
          }}
          aria-label="Active patrol carousel"
        >
          <div className="active-panel-head">
            <div className="active-heading-copy">
              <h3>Active patrols</h3>
              <span className="active-heading-sub">Live operations</span>
            </div>
            {currentActive && <span className="active-pill"><span /> {currentActive.status === 'DRAFT' ? 'Draft' : 'In progress'}</span>}
          </div>

          {activeLoading ? (
            <p className="active-empty">Loading active patrols…</p>
          ) : activeList.length === 0 ? (
            <div className="active-empty"><MonitorDot size={22} /><strong>No active patrols</strong><span>New patrols will appear here when they start.</span></div>
          ) : (
            <>
              <div
                className="active-carousel-viewport"
                tabIndex={0}
                role="region"
                aria-roledescription="carousel"
                aria-label="Active patrols. Use left and right arrow keys to change slides."
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    moveActive(-1)
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    moveActive(1)
                  }
                }}
                onTouchStart={(event) => {
                  touchStartX.current = event.touches[0]?.clientX ?? null
                  setActivePaused(true)
                }}
                onTouchEnd={(event) => {
                  const startX = touchStartX.current
                  const endX = event.changedTouches[0]?.clientX
                  if (startX !== null && endX !== undefined && Math.abs(startX - endX) > 42) {
                    moveActive(startX > endX ? 1 : -1)
                  }
                  touchStartX.current = null
                  setActivePaused(false)
                }}
                onTouchCancel={() => {
                  touchStartX.current = null
                  setActivePaused(false)
                }}
              >
                <div
                  className="active-carousel-track"
                  style={{ transform: `translateX(-${activeIndex * 100}%)` }}
                >
                  {activeList.map((patrol, index) => {
                    const progress = patrol.totalCheckpoints
                      ? Math.min(100, Math.round((patrol._count.results / patrol.totalCheckpoints) * 100))
                      : 0
                    return (
                      <article
                        key={patrol.id}
                        className={`active-slide${index === activeIndex ? ' active-slide-current' : ''}`}
                        role="group"
                        aria-roledescription="slide"
                        aria-label={`${index + 1} of ${activeList.length}: ${patrol.route.name}`}
                        aria-hidden={index !== activeIndex}
                        inert={index !== activeIndex}
                      >
                        <div className="active-current-label"><MonitorDot size={14} /> CURRENT PATROL · {index + 1}/{activeList.length}</div>
                        <h4>{patrol.route.name}</h4>
                        <p className="active-last-seen"><Clock3 size={13} /> Activity recorded {fmt(patrol.lastActivityAt)}</p>
                        <div className="active-details">
                          <div><MapPin size={14} /><span><small>Site</small><strong>{patrol.route.site.name}</strong></span></div>
                          <div><MonitorDot size={14} /><span><small>Operator</small><strong>{patrol.operator.fullName}</strong></span></div>
                        </div>
                        <div className="active-progress-block">
                          <div className="active-progress-label"><span>Checkpoints completed</span><strong>{patrol._count.results}/{patrol.totalCheckpoints}</strong></div>
                          <div className="active-progress-track"><span style={{ width: `${progress}%` }} /></div>
                        </div>
                        <div className="active-panel-foot">
                          <span>Patrol in progress</span>
                          <button type="button" className="active-view-btn" onClick={openActive}>View patrols <ArrowUpRight size={14} /></button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </div>
              {activeList.length > 1 && (
                <div className="active-carousel-controls">
                  <div className="active-arrows">
                    <button type="button" onClick={() => moveActive(-1)} aria-label="Previous active patrol"><ChevronLeft size={16} /></button>
                  </div>
                  <div className="active-dots" role="group" aria-label="Choose active patrol">
                    {activeList.map((patrol, index) => (
                      <button
                        type="button"
                        key={patrol.id}
                        className={index === activeIndex ? 'active' : ''}
                        onClick={() => setActiveIndex(index)}
                        aria-label={`Show patrol ${index + 1}: ${patrol.route.name}`}
                        aria-pressed={index === activeIndex}
                      />
                    ))}
                  </div>
                  <div className="active-arrows">
                    <button type="button" onClick={() => moveActive(1)} aria-label="Next active patrol"><ChevronRight size={16} /></button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <section className="dash-quick-section">
        <div className="dash-section-heading"><div><p className="dash-eyebrow">YOUR WORKSPACE</p><h3>Quick access</h3></div></div>
        <div className="dash-quick-grid">
          {quickAccessItems.map((item) => {
            const Icon = item.icon
            return <button type="button" key={item.title} className="dash-quick-card" onClick={item.onClick}>
              <span className="quick-icon"><Icon size={18} /></span>
              <span className="quick-copy"><strong>{item.title}</strong><small>{item.description}</small></span>
              {item.meta && <span className="quick-meta">{item.meta}</span>}
              <ArrowUpRight className="quick-arrow" size={15} />
            </button>
          })}
        </div>
      </section>

      {popup === 'issues' && (
        <div className="dash-popup-backdrop" onMouseDown={() => setPopup(null)}>
          <section className="dash-popup dash-issues-popup" role="dialog" aria-modal="true" aria-labelledby="dash-issues-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dash-popup-head">
              <div><p className="dash-popup-eyebrow">ISSUE REGISTER</p><h3 id="dash-issues-title"><AlertTriangle size={18} /> Flagged Issues <span className="popup-count">{issueList.length}</span></h3></div>
              <button type="button" onClick={() => setPopup(null)} aria-label="Close flagged issues"><X size={18} /></button>
            </div>
            <div className="dash-popup-body">
              {issueLoading ? <p className="tl-empty">Loading flagged issues…</p> : issueList.length === 0 ? <p className="tl-empty">No flagged issues.</p> : issueList.map((it) => {
                const imageUrl = it.screenshotPath ? screenshotUrl(it.screenshotPath) : null
                return <article key={it.id} className="popup-issue">
                  <div className="popup-issue-image">
                    {imageUrl ? <a href={imageUrl} target="_blank" rel="noreferrer" aria-label={`Open screenshot for ${it.checkpoint.camera.name}`}><img src={imageUrl} alt={`Captured evidence at ${it.checkpoint.camera.name}`} loading="lazy" /></a> : <div className="popup-no-image"><ImageIcon size={20} /><span>No screenshot attached</span></div>}
                  </div>
                  <div className="popup-issue-copy">
                    <div className="popup-issue-heading"><strong>{it.checkpoint.camera.name}</strong><span className="popup-issue-badge">Issue flagged</span></div>
                    <div className="popup-issue-meta"><span>{it.job.route.name}</span><span>{it.job.route.site.name}</span><span>{it.job.operator.fullName}</span></div>
                    {it.comment ? <p className="popup-issue-comment">“{it.comment}”</p> : <p className="popup-issue-comment popup-no-comment">No operator comment was recorded.</p>}
                    <span className="popup-issue-time">{fmt(it.completedAt)}</span>
                  </div>
                </article>
              })}
            </div>
          </section>
        </div>
      )}

      {popup === 'active' && (
        <div className="dash-popup-backdrop" onMouseDown={() => setPopup(null)}>
          <section className="dash-popup" role="dialog" aria-modal="true" aria-labelledby="dash-active-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dash-popup-head"><h3 id="dash-active-title"><MonitorDot size={18} /> Active Patrols</h3><button type="button" onClick={() => setPopup(null)} aria-label="Close active patrols"><X size={18} /></button></div>
            <div className="dash-popup-body">
              {activeLoading ? <p className="tl-empty">Loading…</p> : activeList.length === 0 ? <p className="tl-empty">No active patrols right now.</p> : activeList.map((a) => (
                <div key={a.id} className="popup-active"><div className="popup-active-dot" /><div className="popup-active-copy"><strong>{a.route.name}</strong><span>{a.route.site.name} · {a.operator.fullName}</span><span>{a._count.results} of {a.totalCheckpoints} checkpoints completed</span><span className="popup-active-status">{a.status === 'DRAFT' ? 'Draft' : 'In progress'} · {fmt(a.lastActivityAt)}</span></div></div>
              ))}
            </div>
          </section>
        </div>
      )}

      {popup === 'cameras' && (
        <div className="dash-popup-backdrop" onMouseDown={() => setPopup(null)}>
          <section className="dash-popup" role="dialog" aria-modal="true" aria-labelledby="dash-cameras-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dash-popup-head"><h3 id="dash-cameras-title"><Camera size={18} /> Cameras by Site</h3><button type="button" onClick={() => setPopup(null)} aria-label="Close camera directory"><X size={18} /></button></div>
            <div className="dash-popup-body">
              {cameraLoading ? <p className="tl-empty">Loading…</p> : cameraList.length === 0 ? <p className="tl-empty">No cameras yet.</p> : (() => {
                const bySite = new Map<string, CameraType[]>()
                for (const c of cameraList) {
                  const site = c.site?.name ?? 'Unassigned'
                  if (!bySite.has(site)) bySite.set(site, [])
                  bySite.get(site)!.push(c)
                }
                return Array.from(bySite.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([site, cams]) => (
                  <div key={site} className="popup-cam-group"><div className="popup-cam-site">{site}<span>{cams.length}</span></div>{cams.map((c) => <div key={c.id} className="popup-cam"><Camera size={14} /><div><strong>{c.name}</strong><span>{c.cameraCode} · {c.location || 'No location'}</span></div></div>)}</div>
                ))
              })()}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
