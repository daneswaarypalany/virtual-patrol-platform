import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { ActivePatrolItem, PatrolJobSummary } from '../lib/patrol'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { camerasApi } from '../lib/cameras'
import type { Camera as CameraType } from '../lib/cameras'
import { useAuth } from '../auth/AuthContext'
import './Dashboard.css'

type DashboardPage = 'cameras' | 'routes' | 'patrol' | 'reports' | 'logs'
type PopupType = 'issues' | 'active' | 'cameras' | null
type TrendRange = 'daily' | 'weekly' | 'monthly'

interface PatrolTrendBucket {
  label: string
  start: Date
  end: Date
}

type IssueDatePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

interface IssueTrendPoint {
  label: string
  count: number
}

const ISSUE_DATE_PRESETS: { key: IssueDatePreset; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
]

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
}

function startOfLocalWeek(date: Date): Date {
  const start = startOfLocalDay(date)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

function buildIssueTrend(
  issues: IssueItem[],
  preset: IssueDatePreset,
  fromDate: Date | null,
  toDate: Date | null,
): IssueTrendPoint[] {
  const dated = issues
    .map((issue) => ({ issue, timestamp: new Date(issue.completedAt).getTime() }))
    .filter((entry) => Number.isFinite(entry.timestamp))

  if (!dated.length) return []

  const now = new Date()
  const earliest = startOfLocalDay(new Date(Math.min(...dated.map((item) => item.timestamp))))
  const latest = endOfLocalDay(new Date(Math.max(...dated.map((item) => item.timestamp))))
  let rangeStart = earliest
  let rangeEnd = latest

  if (preset === 'today') {
    rangeStart = startOfLocalDay(now)
    rangeEnd = endOfLocalDay(now)
  } else if (preset === 'week') {
    rangeStart = startOfLocalWeek(now)
    rangeEnd = endOfLocalDay(now)
  } else if (preset === 'month') {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1)
    rangeEnd = endOfLocalDay(now)
  } else if (preset === 'custom') {
    rangeStart = fromDate ? startOfLocalDay(fromDate) : earliest
    rangeEnd = toDate ? endOfLocalDay(toDate) : latest
  }

  if (rangeEnd.getTime() < rangeStart.getTime()) return []

  const spanDays = Math.max(1, Math.ceil((rangeEnd.getTime() - rangeStart.getTime() + 1) / 86400000))
  const granularity: 'six-hour' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly' =
    preset === 'today' ? 'six-hour'
      : preset === 'week' ? 'daily'
        : preset === 'month' ? 'weekly'
          : spanDays <= 14 ? 'daily'
            : spanDays <= 120 ? 'weekly'
              : spanDays <= 740 ? 'monthly'
                : spanDays <= 2190 ? 'quarterly' : 'yearly'

  const buckets: { label: string; start: Date; end: Date }[] = []

  if (granularity === 'six-hour') {
    const dayStart = startOfLocalDay(rangeStart)
    for (let hour = 0; hour < 24; hour += 6) {
      const start = new Date(dayStart)
      start.setHours(hour, 0, 0, 0)
      const end = new Date(start)
      end.setHours(hour + 6, 0, 0, 0)
      buckets.push({ label: `${String(hour).padStart(2, '0')}:00`, start, end })
    }
  } else {
    let cursor: Date
    if (granularity === 'monthly') cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    else if (granularity === 'quarterly') cursor = new Date(rangeStart.getFullYear(), Math.floor(rangeStart.getMonth() / 3) * 3, 1)
    else if (granularity === 'yearly') cursor = new Date(rangeStart.getFullYear(), 0, 1)
    else cursor = startOfLocalDay(rangeStart)

    // Protect the chart from extremely long histories while keeping all available years/quarters readable.
    for (let guard = 0; cursor.getTime() <= rangeEnd.getTime() && guard < 240; guard += 1) {
      const start = new Date(cursor)
      const end = new Date(cursor)
      if (granularity === 'daily') end.setDate(end.getDate() + 1)
      else if (granularity === 'weekly') end.setDate(end.getDate() + 7)
      else if (granularity === 'monthly') end.setMonth(end.getMonth() + 1)
      else if (granularity === 'quarterly') end.setMonth(end.getMonth() + 3)
      else end.setFullYear(end.getFullYear() + 1)

      let label = ''
      if (granularity === 'daily') label = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      else if (granularity === 'weekly') {
        const last = new Date(end.getTime() - 1)
        label = `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}–${last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
      } else if (granularity === 'monthly') label = start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      else if (granularity === 'quarterly') label = `Q${Math.floor(start.getMonth() / 3) + 1} '${String(start.getFullYear()).slice(-2)}`
      else label = String(start.getFullYear())

      buckets.push({ label, start, end })
      cursor = end
    }
  }

  return buckets.map((bucket) => ({
    label: bucket.label,
    count: dated.reduce((total, entry) => total + (entry.timestamp >= bucket.start.getTime() && entry.timestamp < bucket.end.getTime() ? 1 : 0), 0),
  }))
}

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
  const [patrolHistory, setPatrolHistory] = useState<PatrolJobSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [trendRange, setTrendRange] = useState<TrendRange>('weekly')
  const [popup, setPopup] = useState<PopupType>(null)
  const [activeList, setActiveList] = useState<ActivePatrolItem[]>([])
  const [activeLoading, setActiveLoading] = useState(true)
  const [activeIndex, setActiveIndex] = useState(0)
  const [activePaused, setActivePaused] = useState(false)
  const [issueList, setIssueList] = useState<IssueItem[]>([])
  const [issueLoading, setIssueLoading] = useState(false)
  const [issueDatePreset, setIssueDatePreset] = useState<IssueDatePreset>('all')
  const [issueSiteFilter, setIssueSiteFilter] = useState('all')
  const [issueRouteFilter, setIssueRouteFilter] = useState('all')
  const [issueFromDate, setIssueFromDate] = useState<Date | null>(null)
  const [issueToDate, setIssueToDate] = useState<Date | null>(null)
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

  // Load the signed-in user's accessible patrol history for the trend chart.
  // The dashboard chart is derived only from API records; no placeholder metrics are fabricated.
  useEffect(() => {
    let cancelled = false

    const loadHistory = async (initial = false) => {
      try {
        const jobs = await patrolApi.listJobs()
        if (!cancelled) setPatrolHistory(jobs)
      } catch {
        if (!cancelled) setPatrolHistory([])
      } finally {
        if (!cancelled && initial) setHistoryLoading(false)
      }
    }

    void loadHistory(true)
    const interval = window.setInterval(() => void loadHistory(), 60000)
    const onFocus = () => void loadHistory()
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
    setIssueDatePreset('all')
    setIssueSiteFilter('all')
    setIssueRouteFilter('all')
    setIssueFromDate(null)
    setIssueToDate(null)
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

  // Recent events use relative time; historical fallback events show their
  // full date and time so users can tell exactly when they occurred.
  const formatActivityTime = (iso: string, historical: boolean) => {
    if (!historical) return fmt(iso)
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return 'Unknown time'
    return date.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
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

  // Keep the greeting friendly and avoid repeating a username that is the
  // same as the user's role (e.g. role ADMIN with username "admin").
  const greetingRole =
    user?.role === 'ADMIN'
      ? 'Admin'
      : user?.role === 'OPERATOR'
        ? 'Operator'
        : user?.role === 'VIEWER'
          ? 'Viewer'
          : null
  const greetingUsername = user?.username?.trim()
  const greetingIdentity =
    greetingRole && greetingUsername
      ? greetingUsername.toLowerCase() === greetingRole.toLowerCase()
        ? greetingRole
        : `${greetingRole} · ${greetingUsername}`
      : greetingRole ?? greetingUsername ?? user?.fullName?.trim() ?? 'User'

  // The backend returns either rolling-24-hour activity or, when that window
  // is empty, a small historical fallback. Detect which set we received.
  const activityNow = Date.now()
  const activityCutoff = activityNow - 24 * 60 * 60 * 1000
  const availableTimeline = (data?.timeline ?? [])
    .filter((item) => {
      const timestamp = new Date(item.at).getTime()
      return Number.isFinite(timestamp) && timestamp <= activityNow
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const recentTimeline = availableTimeline.filter(
    (item) => new Date(item.at).getTime() >= activityCutoff,
  )
  const showingHistoricalActivity =
    recentTimeline.length === 0 && availableTimeline.length > 0
  const activitySource = showingHistoricalActivity
    ? availableTimeline
    : recentTimeline
  const visibleActivity = activitySource.filter((item) => {
    if (tlFilter === 'issues') return item.type === 'issue'
    if (tlFilter === 'patrols') return item.type !== 'issue'
    return true
  })

  const trendData = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const buckets: PatrolTrendBucket[] = []

    if (trendRange === 'daily') {
      for (let offset = 6; offset >= 0; offset -= 1) {
        const start = new Date(today)
        start.setDate(today.getDate() - offset)
        const end = new Date(start)
        end.setDate(start.getDate() + 1)
        buckets.push({
          label: start.toLocaleDateString(undefined, { weekday: 'short' }),
          start,
          end,
        })
      }
    } else if (trendRange === 'weekly') {
      const currentWeek = new Date(today)
      currentWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7))
      for (let offset = 7; offset >= 0; offset -= 1) {
        const start = new Date(currentWeek)
        start.setDate(currentWeek.getDate() - offset * 7)
        const end = new Date(start)
        end.setDate(start.getDate() + 7)
        buckets.push({
          label: start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
          start,
          end,
        })
      }
    } else {
      const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      for (let offset = 5; offset >= 0; offset -= 1) {
        const start = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - offset, 1)
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
        buckets.push({
          label: start.toLocaleDateString(undefined, { month: 'short' }),
          start,
          end,
        })
      }
    }

    return buckets.map((bucket) => {
      const started = patrolHistory.reduce((count, job) => {
        const timestamp = new Date(job.startedAt).getTime()
        return Number.isFinite(timestamp) && timestamp >= bucket.start.getTime() && timestamp < bucket.end.getTime()
          ? count + 1
          : count
      }, 0)
      const completed = patrolHistory.reduce((count, job) => {
        if (job.status !== 'COMPLETED' || !job.completedAt) return count
        const timestamp = new Date(job.completedAt).getTime()
        return Number.isFinite(timestamp) && timestamp >= bucket.start.getTime() && timestamp < bucket.end.getTime()
          ? count + 1
          : count
      }, 0)
      return { label: bucket.label, started, completed }
    })
  }, [patrolHistory, trendRange])

  const trendHasActivity = trendData.some((point) => point.started > 0 || point.completed > 0)
  const clearCheckRate = s && s.totalChecks > 0
    ? Math.round(Math.max(0, Math.min(100, ((s.totalChecks - s.issuesFlagged) / s.totalChecks) * 100)))
    : null
  const gaugeLength = Math.PI * 84

  const issueDateBounds = useMemo(() => {
    const now = new Date()
    if (issueDatePreset === 'all') return { from: null as Date | null, to: null as Date | null }
    if (issueDatePreset === 'today') return { from: startOfLocalDay(now), to: endOfLocalDay(now) }
    if (issueDatePreset === 'week') return { from: startOfLocalWeek(now), to: endOfLocalDay(now) }
    if (issueDatePreset === 'month') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfLocalDay(now) }
    return {
      from: issueFromDate ? startOfLocalDay(issueFromDate) : null,
      to: issueToDate ? endOfLocalDay(issueToDate) : null,
    }
  }, [issueDatePreset, issueFromDate, issueToDate])

  const issueSiteOptions = useMemo(() => Array.from(new Set(
    issueList.map((issue) => issue.job?.route?.site?.name).filter((name): name is string => Boolean(name)),
  )).sort((a, b) => a.localeCompare(b)), [issueList])

  const issueRouteOptions = useMemo(() => {
    const routes = new Map<string, { key: string; label: string }>()
    issueList.forEach((issue) => {
      const site = issue.job?.route?.site?.name ?? 'Unknown site'
      const route = issue.job?.route?.name ?? 'Unknown route'
      const key = `${site}|||${route}`
      routes.set(key, { key, label: `${route} · ${site}` })
    })
    return Array.from(routes.values()).sort((a, b) => a.label.localeCompare(b.label))
  }, [issueList])

  const filteredIssues = useMemo(() => issueList.filter((issue) => {
    const site = issue.job?.route?.site?.name ?? ''
    const route = issue.job?.route?.name ?? ''
    if (issueSiteFilter !== 'all' && site !== issueSiteFilter) return false
    if (issueRouteFilter !== 'all' && `${site}|||${route}` !== issueRouteFilter) return false
    if (issueDateBounds.from || issueDateBounds.to) {
      const timestamp = new Date(issue.completedAt).getTime()
      if (!Number.isFinite(timestamp)) return false
      if (issueDateBounds.from && timestamp < issueDateBounds.from.getTime()) return false
      if (issueDateBounds.to && timestamp > issueDateBounds.to.getTime()) return false
    }
    return true
  }), [issueList, issueDateBounds, issueSiteFilter, issueRouteFilter])

  const issueTrendData = useMemo(
    () => buildIssueTrend(filteredIssues, issueDatePreset, issueFromDate, issueToDate),
    [filteredIssues, issueDatePreset, issueFromDate, issueToDate],
  )
  const issueChartHasActivity = issueTrendData.some((point) => point.count > 0)
  const issueSiteCount = new Set(filteredIssues.map((issue) => issue.job?.route?.site?.name).filter(Boolean)).size
  const issueRouteCount = new Set(filteredIssues.map((issue) => `${issue.job?.route?.site?.name ?? ''}|||${issue.job?.route?.name ?? ''}`)).size
  const issueRangeDescription = issueDatePreset === 'today'
    ? 'Six-hour intervals'
    : issueDatePreset === 'week'
      ? 'Daily totals for this week'
      : issueDatePreset === 'month'
        ? 'Weekly totals for this month'
        : issueDatePreset === 'custom'
          ? 'Buckets sized to your selected range'
          : 'Historical trend using the available issue records'

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
          <h2>Welcome to Virtual Patrol, {greetingIdentity}</h2>
          <p>Here's what's happening across your patrol operations today.</p>
        </div>
        <div className="dash-online"><span className="dot" /> System Online</div>
      </div>

      <section className="ops-overview-panel" aria-label="Patrol operations overview">
        <div className="ops-overview-head">
          <div>
            <p className="dash-eyebrow">FIELD PERFORMANCE</p>
            <h3>Patrol operations overview</h3>
            <p className="ops-overview-subtitle">Patrol activity, checkpoint outcomes and current coverage.</p>
          </div>
          <div className="ops-overview-tools">
            <span className="ops-sites-chip"><MapPin size={14} /> {loading ? '—' : s?.sites ?? 0} sites</span>
            <div className="ops-range-control" role="group" aria-label="Patrol trend aggregation">
              <button type="button" className={trendRange === 'daily' ? 'active' : ''} aria-pressed={trendRange === 'daily'} onClick={() => setTrendRange('daily')}>Daily</button>
              <button type="button" className={trendRange === 'weekly' ? 'active' : ''} aria-pressed={trendRange === 'weekly'} onClick={() => setTrendRange('weekly')}>Weekly</button>
              <button type="button" className={trendRange === 'monthly' ? 'active' : ''} aria-pressed={trendRange === 'monthly'} onClick={() => setTrendRange('monthly')}>Monthly</button>
            </div>
          </div>
        </div>

        <div className="ops-summary-row">
      <div className="dash-stats ops-kpi-grid">
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
          <aside className="ops-gauge-card" aria-label="Clear checkpoint rate">
            <div className="ops-gauge-title">Checkpoint health</div>
            <div className="ops-gauge-visual">
              <svg viewBox="0 0 200 116" role="img" aria-label={clearCheckRate === null ? 'No checkpoint data yet' : `Clear check rate ${clearCheckRate} percent`}>
                <path className="ops-gauge-track" d="M 16 100 A 84 84 0 0 1 184 100" fill="none" strokeWidth="12" strokeLinecap="round" />
                <path className="ops-gauge-progress" d="M 16 100 A 84 84 0 0 1 184 100" fill="none" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${clearCheckRate === null ? 0 : (clearCheckRate / 100) * gaugeLength} ${gaugeLength}`} />
              </svg>
              <div className="ops-gauge-reading">
                <strong>{clearCheckRate === null ? '—' : `${clearCheckRate}%`}</strong>
                <span>clear check rate</span>
              </div>
            </div>
            <p className="ops-gauge-caption">
              {s && s.totalChecks > 0
                ? `${Math.max(0, s.totalChecks - s.issuesFlagged).toLocaleString()} of ${s.totalChecks.toLocaleString()} checkpoint checks were marked clear.`
                : 'Checkpoint health will appear after the first patrol checks are recorded.'}
            </p>
          </aside>
        </div>

        <div className="ops-chart-card">
          <div className="ops-chart-head">
            <div>
              <h4>Patrol activity trend</h4>
              <p>{trendRange === 'daily' ? 'Daily totals over the past 7 days' : trendRange === 'weekly' ? 'Weekly totals over the past 8 weeks' : 'Monthly totals over the past 6 months'}</p>
            </div>
            <div className="ops-chart-legend" aria-label="Chart legend">
              <span><i className="ops-legend-started" /> Started</span>
              <span><i className="ops-legend-completed" /> Completed</span>
            </div>
          </div>

          {historyLoading ? (
            <div className="ops-chart-empty">Loading patrol history…</div>
          ) : patrolHistory.length === 0 ? (
            <div className="ops-chart-empty">No patrol history is available for this account yet.</div>
          ) : !trendHasActivity ? (
            <div className="ops-chart-empty">No patrol activity in this range. Try another time range.</div>
          ) : (
            <div className="ops-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 12, right: 14, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--ops-chart-grid)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--ops-chart-axis)', fontSize: 10 }} axisLine={false} tickLine={false} dy={8} minTickGap={14} />
                  <YAxis allowDecimals={false} width={34} tick={{ fill: 'var(--ops-chart-axis)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--ops-tooltip-bg)', border: '1px solid var(--border)', borderRadius: 12, color: 'var(--text)', boxShadow: '0 12px 28px rgba(0,0,0,0.12)' }} labelStyle={{ color: 'var(--text-muted)', fontWeight: 700 }} itemStyle={{ color: 'var(--text)' }} />
                  <Line type="monotone" dataKey="started" name="Patrols started" stroke="#7895AC" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  <Line type="monotone" dataKey="completed" name="Patrols completed" stroke="#329578" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <div className="dash-main-grid">
        <section className="dash-panel dash-activity-panel">
          <div className="dash-panel-head">
            <div className="dash-panel-title">
              <h3><Activity size={16} /> Recent Activity</h3>
              <span className="tl-window-label">
                {showingHistoricalActivity ? 'Earlier activity' : 'Last 24 hours'}
              </span>
            </div>
            <div className="tl-filter" role="group" aria-label="Filter recent activity">
              <button type="button" className={tlFilter === 'all' ? 'active' : ''} onClick={() => setTlFilter('all')}>All</button>
              <button type="button" className={tlFilter === 'patrols' ? 'active' : ''} onClick={() => setTlFilter('patrols')}>Patrols</button>
              <button type="button" className={tlFilter === 'issues' ? 'active' : ''} onClick={() => setTlFilter('issues')}>Issues</button>
            </div>
          </div>

          {loading ? (
            <p className="tl-loading">Loading activity…</p>
          ) : visibleActivity.length === 0 ? (
            <p className="tl-empty">
              {showingHistoricalActivity
                ? 'No past activity is available for this filter.'
                : 'No activity recorded in the last 24 hours for this filter.'}
            </p>
          ) : (
            <div
              className="timeline"
              aria-label={
                showingHistoricalActivity
                  ? 'Earlier activity'
                  : 'Activity from the last 24 hours'
              }
            >
              {visibleActivity.map((item, i) => (
                <div
                  key={`${item.at}-${item.title}-${i}`}
                  className="tl-item"
                >
                  <div className={`tl-dot ${dotClass(item.type)}`}>
                    {timelineIcon(item.type)}
                  </div>
                  <div className="tl-body">
                    <div className="tl-top">
                      <strong>{item.title}</strong>
                      <span className="tl-time">
                        {formatActivityTime(item.at, showingHistoricalActivity)}
                      </span>
                    </div>
                    <p>{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="dash-panel-foot">
            <span>
              {showingHistoricalActivity
                ? 'HISTORICAL ACTIVITY · DATE & TIME SHOWN'
                : 'ROLLING 24-HOUR WINDOW · PATROL & ISSUE EVENTS'}
            </span>
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
              <div><p className="dash-popup-eyebrow">ISSUE REGISTER & ANALYTICS</p><h3 id="dash-issues-title"><AlertTriangle size={18} /> Flagged Issues <span className="popup-count">{filteredIssues.length}</span></h3></div>
              <button type="button" onClick={() => setPopup(null)} aria-label="Close flagged issues"><X size={18} /></button>
            </div>
            <div className="dash-popup-body issue-popup-body">
              {issueLoading ? <p className="tl-empty">Loading flagged issues…</p> : issueList.length === 0 ? <p className="tl-empty">No flagged issues.</p> : (
                <>
                  <section className="issue-analytics" aria-labelledby="issue-analytics-title">
                    <div className="issue-analytics-heading">
                      <div>
                        <p className="issue-analytics-eyebrow">OVERVIEW</p>
                        <h4 id="issue-analytics-title">Issue trends</h4>
                        <p className="issue-analytics-caption">Explore how flagged issues change over time.</p>
                      </div>
                      <span className="issue-filtered-count">{filteredIssues.length} matching {filteredIssues.length === 1 ? 'issue' : 'issues'}</span>
                    </div>

                    <div className="issue-filter-row">
                      <div className="issue-date-presets" role="group" aria-label="Filter issues by date range">
                        {ISSUE_DATE_PRESETS.map((preset) => (
                          <button
                            key={preset.key}
                            type="button"
                            className={issueDatePreset === preset.key ? 'active' : ''}
                            aria-pressed={issueDatePreset === preset.key}
                            onClick={() => setIssueDatePreset(preset.key)}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="issue-select-filters">
                        <label>
                          <span>Site</span>
                          <select aria-label="Filter flagged issues by site" value={issueSiteFilter} onChange={(event) => setIssueSiteFilter(event.target.value)}>
                            <option value="all">All sites</option>
                            {issueSiteOptions.map((site) => <option key={site} value={site}>{site}</option>)}
                          </select>
                        </label>
                        <label>
                          <span>Patrol route</span>
                          <select aria-label="Filter flagged issues by patrol route" value={issueRouteFilter} onChange={(event) => setIssueRouteFilter(event.target.value)}>
                            <option value="all">All routes</option>
                            {issueRouteOptions.map((route) => <option key={route.key} value={route.key}>{route.label}</option>)}
                          </select>
                        </label>
                      </div>
                    </div>

                    {issueDatePreset === 'custom' && (
                      <div className="issue-custom-dates">
                        <label>
                          <span>From</span>
                          <DatePicker
                            selected={issueFromDate}
                            onChange={(date: Date | null) => {
                              setIssueFromDate(date)
                              if (date && issueToDate && issueToDate < date) setIssueToDate(date)
                            }}
                            selectsStart
                            startDate={issueFromDate}
                            endDate={issueToDate}
                            placeholderText="Start date"
                            dateFormat="dd MMM yyyy"
                            className="issue-date-input"
                            calendarClassName="issue-calendar"
                            showMonthDropdown
                            showYearDropdown
                            dropdownMode="select"
                            isClearable
                          />
                        </label>
                        <label>
                          <span>To</span>
                          <DatePicker
                            selected={issueToDate}
                            onChange={(date: Date | null) => setIssueToDate(date)}
                            selectsEnd
                            startDate={issueFromDate}
                            endDate={issueToDate}
                            minDate={issueFromDate ?? undefined}
                            placeholderText="End date"
                            dateFormat="dd MMM yyyy"
                            className="issue-date-input"
                            calendarClassName="issue-calendar"
                            showMonthDropdown
                            showYearDropdown
                            dropdownMode="select"
                            isClearable
                          />
                        </label>
                        <span className="issue-custom-hint">Choose a start and/or end date. The end date includes the full day.</span>
                      </div>
                    )}

                    <div className="issue-analytics-stats" aria-label="Filtered issue summary">
                      <div className="issue-summary-card">
                        <span>Flagged issues</span>
                        <strong>{filteredIssues.length}</strong>
                      </div>
                      <div className="issue-summary-card">
                        <span>Sites affected</span>
                        <strong>{issueSiteCount}</strong>
                      </div>
                      <div className="issue-summary-card">
                        <span>Routes affected</span>
                        <strong>{issueRouteCount}</strong>
                      </div>
                    </div>

                    <div className="issue-chart-card">
                      <div className="issue-chart-heading">
                        <div>
                          <h5>Flagged issues over time</h5>
                          <p>{issueRangeDescription}</p>
                        </div>
                        <span className="issue-chart-legend"><i aria-hidden="true" /> Issue count</span>
                      </div>
                      {issueChartHasActivity ? (
                        <div className="issue-chart" role="img" aria-label="Bar chart showing flagged issue counts across the selected date range">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={issueTrendData} margin={{ top: 8, right: 9, bottom: 0, left: -13 }}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--issue-chart-grid)" />
                              <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} minTickGap={14} />
                              <YAxis allowDecimals={false} width={30} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                              <Tooltip
                                cursor={{ fill: 'var(--issue-chart-hover)' }}
                                contentStyle={{ background: 'var(--issue-chart-tooltip)', border: '1px solid var(--issue-chart-border)', borderRadius: 10, color: 'var(--text)', fontSize: 12 }}
                                labelStyle={{ color: 'var(--text)', fontWeight: 700 }}
                              />
                              <Bar dataKey="count" name="Flagged issues" fill="var(--issue-chart-bar)" radius={[5, 5, 0, 0]} maxBarSize={38} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="issue-chart-empty">No dated issues match these filters. Try another date range, site, or route.</div>
                      )}
                    </div>
                  </section>

                  <div className="issue-list-heading">
                    <div><h4>Issue records</h4><p>Evidence, operator comments, and patrol details for the filtered results.</p></div>
                    <span>{filteredIssues.length} of {issueList.length}</span>
                  </div>
                  {filteredIssues.length === 0 ? (
                    <div className="issue-list-empty">No flagged issues match the selected filters.</div>
                  ) : filteredIssues.map((it) => {
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
                </>
              )}
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
