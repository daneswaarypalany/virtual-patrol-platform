import { useEffect, useState, useCallback, useRef } from 'react'
import { Activity, RefreshCw, Search, TrendingUp, Users } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import type { ActiveUser, ActivityLogEntry, UserTrendDayUser, UserTrendPoint } from '../lib/logs'
import { logsApi, formatAction, formatDetails } from '../lib/logs'
import { getSocket } from '../lib/socket'
import { API_BASE_URL } from '../lib/api'
import SearchableSelect from '../components/SearchableSelect'
import './Logs.css'

const PAGE_SIZE = 25

type DatePreset = 'all' | 'today' | 'week' | 'month' | 'custom'

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
]

type PositionedTrendPoint = UserTrendPoint & { x: number; y: number }
type TrendDayDetails = { loading: boolean; users: UserTrendDayUser[]; error?: string }

function startOfLocalDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfLocalDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(23, 59, 59, 999)
  return result
}

function localDateInputBoundary(value: string, end = false): Date {
  const [year, month, day] = value.split('-').map(Number)
  return end
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0)
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getDateBounds(
  preset: DatePreset,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  if (preset === 'all' || preset === 'custom') {
    if (preset === 'all' || !customFrom || !customTo || customFrom > customTo) return {}
    return {
      from: localDateInputBoundary(customFrom).toISOString(),
      to: localDateInputBoundary(customTo, true).toISOString(),
    }
  }

  const now = new Date()
  const to = endOfLocalDay(now)
  let from = startOfLocalDay(now)

  if (preset === 'week') {
    // Monday is the first day of the week.
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7))
  } else if (preset === 'month') {
    from.setDate(1)
  }

  return { from: from.toISOString(), to: to.toISOString() }
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never'
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function describeError(err: unknown): string {
  const e = err as {
    response?: { status?: number; data?: { message?: string | string[] } }
    message?: string
  }
  const status = e.response?.status
  const msg = e.response?.data?.message
  const detail = Array.isArray(msg) ? msg.join(', ') : msg
  return [status ? `HTTP ${status}` : 'No response', detail ?? e.message]
    .filter(Boolean)
    .join(' - ')
}

function formatTrendDay(day: string): string {
  // Using local noon avoids date shifting around midnight when rendering
  // YYYY-MM-DD values returned by the reporting query.
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatTrendDayLong(day: string): string {
  // Use local noon so a YYYY-MM-DD calendar label is not shifted by timezone.
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatTrendClock(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function actionTone(action: string): 'ok' | 'warn' | 'neutral' {
  const a = action.toUpperCase()
  if (a.includes('LOGIN') || a.includes('CREATE') || a.includes('START') || a.includes('COMPLETE'))
    return 'ok'
  if (
    a.includes('LOGOUT') ||
    a.includes('DELETE') ||
    a.includes('DISCARD') ||
    a.includes('RELEASE') ||
    a.includes('FAIL')
  )
    return 'warn'
  return 'neutral'
}

export default function Logs() {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState('')

  const [userTrend, setUserTrend] = useState<UserTrendPoint[]>([])
  const [trendDays, setTrendDays] = useState<7 | 14 | 30>(14)
  const [trendLoading, setTrendLoading] = useState(true)
  const [trendError, setTrendError] = useState('')
  const [hoveredTrendPoint, setHoveredTrendPoint] = useState<PositionedTrendPoint | null>(null)
  const [trendDayDetails, setTrendDayDetails] = useState<Record<string, TrendDayDetails>>({})
  const requestedTrendDays = useRef(new Set<string>())

  const [entries, setEntries] = useState<ActivityLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [logsLoading, setLogsLoading] = useState(true)
  const [error, setError] = useState('')

  const [actions, setActions] = useState<string[]>([])
  const [actionFilter, setActionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const loadActiveUsers = useCallback(async () => {
    try {
      setActiveUsers(await logsApi.activeUsers())
      setUsersError('')
    } catch (err) {
      setUsersError(describeError(err))
    } finally {
      setUsersLoading(false)
    }
  }, [])

  const showTrendPointDetails = useCallback((point: PositionedTrendPoint) => {
    setHoveredTrendPoint(point)
    if (requestedTrendDays.current.has(point.day)) return

    requestedTrendDays.current.add(point.day)
    setTrendDayDetails((previous) => ({
      ...previous,
      [point.day]: { loading: true, users: [] },
    }))
    logsApi.userTrendDayUsers(point.day)
      .then((users) => {
        setTrendDayDetails((previous) => ({
          ...previous,
          [point.day]: { loading: false, users },
        }))
      })
      .catch((err: unknown) => {
        requestedTrendDays.current.delete(point.day)
        setTrendDayDetails((previous) => ({
          ...previous,
          [point.day]: { loading: false, users: [], error: describeError(err) },
        }))
      })
  }, [])

  const hideTrendPointDetails = useCallback((day: string) => {
    setHoveredTrendPoint((current) => (current?.day === day ? null : current))
  }, [])

  const loadUserTrend = useCallback(async () => {
    setTrendLoading(true)
    setTrendError('')
    setHoveredTrendPoint(null)
    setTrendDayDetails({})
    requestedTrendDays.current.clear()
    try {
      setUserTrend(await logsApi.userTrend(trendDays))
    } catch (err) {
      setTrendError(`Could not load user trends (${describeError(err)})`)
    } finally {
      setTrendLoading(false)
    }
  }, [trendDays])

  const loadLogs = useCallback(async () => {
    if (datePreset === 'custom') {
      if (!customFrom || !customTo) {
        setEntries([])
        setTotal(0)
        setLogsLoading(false)
        setError('Choose a start and end date to apply a custom range.')
        return
      }
      if (customFrom > customTo) {
        setEntries([])
        setTotal(0)
        setLogsLoading(false)
        setError('The end date must be on or after the start date.')
        return
      }
    }

    setLogsLoading(true)
    setError('')
    try {
      const dateBounds = getDateBounds(datePreset, customFrom, customTo)
      const result = await logsApi.list({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter || undefined,
        search: search || undefined,
        from: dateBounds.from,
        to: dateBounds.to,
      })
      setEntries(result.items)
      setTotal(result.total)
    } catch (err) {
      setError(`Failed to load activity log (${describeError(err)})`)
    } finally {
      setLogsLoading(false)
    }
  }, [page, actionFilter, search, datePreset, customFrom, customTo])

  useEffect(() => {
    logsApi.actions().then(setActions).catch(() => {})
  }, [])

  useEffect(() => {
    loadActiveUsers()
  }, [loadActiveUsers])

  useEffect(() => {
    loadUserTrend()
  }, [loadUserTrend])

  // Live updates: the backend broadcasts the full list of currently-online
  // userIds over the socket (connected app-wide via AuthContext) whenever
  // anyone connects or disconnects. Merge that into the roster we already
  // have instead of refetching, so the dot flips instantly.
  useEffect(() => {
    const socket = getSocket()
    if (!socket) return
    const onPresence = (onlineUserIds: string[]) => {
      const online = new Set(onlineUserIds)
      setActiveUsers((prev) =>
        prev.map((u) => ({ ...u, online: online.has(u.id) })),
      )
    }
    socket.on('presence', onPresence)
    return () => {
      socket.off('presence', onPresence)
    }
  }, [])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const trendPeakUsers = userTrend.reduce((peak, point) => Math.max(peak, point.activeUsers), 0)
  const trendActivityTotal = userTrend.reduce((sum, point) => sum + point.activities, 0)
  const onlineUserCount = activeUsers.filter((user) => user.online).length
  const trendMaxUsers = Math.max(1, ...userTrend.map((point) => point.activeUsers))
  const trendPlot: PositionedTrendPoint[] = userTrend.map((point, index) => {
    const left = 42
    const right = 872
    const top = 24
    const bottom = 172
    const x = left + (userTrend.length <= 1 ? 0 : (index * (right - left)) / (userTrend.length - 1))
    const y = bottom - (point.activeUsers / trendMaxUsers) * (bottom - top)
    return { ...point, x, y }
  })
  const trendLinePath = trendPlot
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const trendAreaPath = trendPlot.length
    ? `${trendLinePath} L ${trendPlot[trendPlot.length - 1].x.toFixed(2)} 172 L ${trendPlot[0].x.toFixed(2)} 172 Z`
    : ''
  const trendLabelStep = Math.max(1, Math.ceil(trendPlot.length / 7))
  const hoveredDetails = hoveredTrendPoint ? trendDayDetails[hoveredTrendPoint.day] : undefined
  const tooltipPosition = hoveredTrendPoint
    ? {
        left: `${(hoveredTrendPoint.x / 900) * 100}%`,
        top: `${(hoveredTrendPoint.y / 220) * 100}%`,
      }
    : undefined

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  const chooseDatePreset = (preset: DatePreset) => {
    setPage(1)
    setDatePreset(preset)
  }

  return (
    <div className="logs-page">
      <div className="logs-muted" style={{ fontSize: 11 }}>
        Server: {API_BASE_URL}
      </div>

      <section className="logs-panel">
        <div className="logs-panel-head">
          <h3>Active Users</h3>
          <button
            className="logs-refresh"
            onClick={loadActiveUsers}
            title="Refresh now"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        {usersLoading ? (
          <div className="logs-empty">Loading…</div>
        ) : usersError ? (
          <div className="logs-error">Failed to load users ({usersError})</div>
        ) : activeUsers.length === 0 ? (
          <div className="logs-empty">No active users found.</div>
        ) : (
          <div className="logs-users-table-wrap">
            <table className="logs-users-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Active</th>
                  <th>Last Login</th>
                </tr>
              </thead>
              <tbody>
                {activeUsers.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <span
                        className={`logs-dot ${u.online ? 'online' : 'offline'}`}
                        title={u.online ? 'Online' : 'Offline'}
                      />
                    </td>
                    <td>
                      <div className="logs-user-cell">
                        <strong>{u.fullName}</strong>
                        <span>@{u.username}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`logs-role logs-role-${u.role.toLowerCase()}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>
                      <span className={`logs-status ${u.online ? 'online' : 'offline'}`}>
                        {u.online ? 'Online' : 'Offline'}
                      </span>
                    </td>
                    <td>{timeAgo(u.lastActiveAt)}</td>
                    <td>{timeAgo(u.lastLoginAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="logs-panel logs-trend-panel">
        <div className="logs-panel-head logs-trend-head">
          <div className="logs-trend-title">
            <span className="logs-trend-icon"><TrendingUp size={17} /></span>
            <div>
              <h3>User activity trend</h3>
              <p>Distinct users with recorded activity each day</p>
            </div>
          </div>
          <div className="logs-trend-range" role="group" aria-label="User trend period">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                className={trendDays === days ? 'active' : ''}
                aria-pressed={trendDays === days}
                onClick={() => setTrendDays(days as 7 | 14 | 30)}
              >
                {days} days
              </button>
            ))}
          </div>
        </div>

        <div className="logs-trend-metrics">
          <div className="logs-trend-metric">
            <span className="logs-trend-metric-icon"><Users size={15} /></span>
            <div><span>Peak daily users</span><strong>{trendLoading ? '—' : trendPeakUsers}</strong></div>
          </div>
          <div className="logs-trend-metric">
            <span className="logs-trend-metric-icon"><Activity size={15} /></span>
            <div><span>Recorded actions</span><strong>{trendLoading ? '—' : trendActivityTotal.toLocaleString()}</strong></div>
          </div>
          <div className="logs-trend-metric">
            <span className="logs-trend-metric-icon online"><span className="logs-dot online" /></span>
            <div><span>Online now</span><strong>{usersLoading ? '—' : onlineUserCount}</strong></div>
          </div>
        </div>

        {trendLoading ? (
          <div className="logs-empty logs-trend-message">Loading user trend…</div>
        ) : trendError ? (
          <div className="logs-error logs-trend-message">{trendError}</div>
        ) : userTrend.length === 0 ? (
          <div className="logs-empty logs-trend-message">No user activity recorded for this period.</div>
        ) : (
          <div className="logs-trend-chart-wrap" onMouseLeave={() => setHoveredTrendPoint(null)}>
            <svg className="logs-trend-chart" viewBox="0 0 900 220" role="group" aria-label={`Daily active users over the last ${trendDays} days`}>
              <defs>
                <linearGradient id="logsTrendArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" className="logs-trend-gradient-top" />
                  <stop offset="100%" className="logs-trend-gradient-bottom" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3].map((tick) => {
                const value = Math.round((trendMaxUsers * (3 - tick)) / 3)
                const y = 24 + (tick * (172 - 24)) / 3
                return (
                  <g key={`${tick}-${value}`}>
                    <line x1="42" x2="872" y1={y} y2={y} className="logs-trend-gridline" />
                    <text x="28" y={y + 4} textAnchor="end" className="logs-trend-axis-label">{value}</text>
                  </g>
                )
              })}
              {trendAreaPath && <path d={trendAreaPath} fill="url(#logsTrendArea)" className="logs-trend-area" />}
              {trendLinePath && <path d={trendLinePath} className="logs-trend-line" />}
              {trendPlot.map((point, index) => (
                <g
                  key={point.day}
                  className="logs-trend-point-group"
                  tabIndex={0}
                  role="button"
                  aria-label={`${formatTrendDayLong(point.day)}: ${point.activeUsers} active users and ${point.activities} recorded actions. Focus or hover to view user details.`}
                  aria-describedby={hoveredTrendPoint?.day === point.day ? 'logs-user-trend-tooltip' : undefined}
                  onMouseEnter={() => showTrendPointDetails(point)}
                  onFocus={() => showTrendPointDetails(point)}
                  onBlur={() => hideTrendPointDetails(point.day)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      showTrendPointDetails(point)
                    } else if (event.key === 'Escape') {
                      hideTrendPointDetails(point.day)
                    }
                  }}
                >
                  <circle cx={point.x} cy={point.y} r="11" className="logs-trend-hit-target" />
                  <circle cx={point.x} cy={point.y} r="3.6" className="logs-trend-point">
                    <title>{`${formatTrendDay(point.day)}: ${point.activeUsers} active users, ${point.activities} actions`}</title>
                  </circle>
                  {(index % trendLabelStep === 0 || index === trendPlot.length - 1) && (
                    <text x={point.x} y="204" textAnchor="middle" className="logs-trend-axis-label">{formatTrendDay(point.day)}</text>
                  )}
                </g>
              ))}
            </svg>
            {hoveredTrendPoint && (
              <div
                id="logs-user-trend-tooltip"
                className={`logs-trend-tooltip ${hoveredTrendPoint.x > 610 ? 'is-left' : 'is-right'} ${hoveredTrendPoint.y > 112 ? 'is-above' : 'is-below'}`}
                style={tooltipPosition}
                role="tooltip"
                aria-live="polite"
              >
                <div className="logs-trend-tooltip-head">
                  <div>
                    <strong>{formatTrendDayLong(hoveredTrendPoint.day)}</strong>
                    <span>{hoveredTrendPoint.activities.toLocaleString()} recorded actions</span>
                  </div>
                  <b>{hoveredTrendPoint.activeUsers} {hoveredTrendPoint.activeUsers === 1 ? 'user' : 'users'}</b>
                </div>
                {hoveredDetails?.loading ? (
                  <div className="logs-trend-tooltip-state">Loading user details…</div>
                ) : hoveredDetails?.error ? (
                  <div className="logs-trend-tooltip-state error">Could not load user details. Move away and hover again to retry.</div>
                ) : !hoveredDetails ? (
                  <div className="logs-trend-tooltip-state">Loading user details…</div>
                ) : hoveredDetails.users.length === 0 ? (
                  <div className="logs-trend-tooltip-state">No user-attributed activity was recorded on this day.</div>
                ) : (
                  <div className="logs-trend-tooltip-users">
                    {hoveredDetails.users.map((user) => (
                      <div className="logs-trend-tooltip-user" key={user.username}>
                        <div className="logs-trend-tooltip-user-heading">
                          <div className="logs-trend-tooltip-user-name">
                            <strong>{user.fullName}</strong>
                            <span>@{user.username} · {user.role}</span>
                          </div>
                          <span className="logs-trend-tooltip-actions">{user.actionCount} {user.actionCount === 1 ? 'action' : 'actions'}</span>
                        </div>
                        <div className="logs-trend-tooltip-login">
                          {user.loginCount > 0 ? (
                            <>
                              <span className="logs-trend-login-badge">{user.loginCount} {user.loginCount === 1 ? 'login' : 'logins'}</span>
                              <span>Signed in {user.loginCount === 1 ? 'at' : '(latest times)'}</span>
                              {user.loginTimestamps.slice(-2).reverse().map((timestamp) => (
                                <time key={timestamp} dateTime={new Date(timestamp).toISOString()}>{formatTrendClock(timestamp)}</time>
                              ))}
                              {user.loginCount > 2 && <small>+{user.loginCount - 2} earlier</small>}
                            </>
                          ) : (
                            <span className="logs-trend-no-login">No login event recorded that day</span>
                          )}
                        </div>
                        <div className="logs-trend-last-active">Last activity {formatTrendClock(user.lastActivityAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="logs-trend-legend"><span className="logs-trend-legend-mark" /> Daily active users</div>
          </div>
        )}
      </section>

      <section className="logs-panel">
        <div className="logs-panel-head">
          <h3>Activity Log</h3>
        </div>

        <div className="logs-filters">
          <form className="logs-search" onSubmit={submitSearch}>
            <Search size={14} />
            <input
              type="text"
              placeholder="Search by user, action, site, camera…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </form>

          <SearchableSelect
            className="logs-action-filter"
            ariaLabel="Filter activity by action"
            portal
            value={actionFilter}
            onChange={(value) => {
              setActionFilter(value)
              setPage(1)
            }}
            placeholder="All actions"
            options={[
              { value: '', label: 'All actions' },
              ...actions.map((action) => ({ value: action, label: formatAction(action) })),
            ]}
          />
        </div>

        <div className="logs-date-toolbar">
          <span className="logs-date-count">
            {total.toLocaleString()} {total === 1 ? 'activity' : 'activities'}
          </span>
          <div className="logs-date-presets" role="group" aria-label="Filter activity by date">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`logs-date-preset ${datePreset === preset.value ? 'active' : ''}`}
                aria-pressed={datePreset === preset.value}
                onClick={() => chooseDatePreset(preset.value)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {datePreset === 'custom' && (
          <div className="logs-custom-range">
            <label>
              <span>From</span>
              <DatePicker
                selected={customFrom ? localDateInputBoundary(customFrom) : null}
                onChange={(date: Date | null) => {
                  setCustomFrom(date ? formatDateInputValue(date) : '')
                  setPage(1)
                }}
                selectsStart
                startDate={customFrom ? localDateInputBoundary(customFrom) : null}
                endDate={customTo ? localDateInputBoundary(customTo) : null}
                maxDate={customTo ? localDateInputBoundary(customTo) : undefined}
                placeholderText="Start date"
                dateFormat="dd MMM yyyy"
                className="logs-date-input"
                wrapperClassName="logs-date-picker"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
              />
            </label>
            <span className="logs-custom-range-separator" aria-hidden="true">–</span>
            <label>
              <span>To</span>
              <DatePicker
                selected={customTo ? localDateInputBoundary(customTo) : null}
                onChange={(date: Date | null) => {
                  setCustomTo(date ? formatDateInputValue(date) : '')
                  setPage(1)
                }}
                selectsEnd
                startDate={customFrom ? localDateInputBoundary(customFrom) : null}
                endDate={customTo ? localDateInputBoundary(customTo) : null}
                minDate={customFrom ? localDateInputBoundary(customFrom) : undefined}
                placeholderText="End date"
                dateFormat="dd MMM yyyy"
                className="logs-date-input"
                wrapperClassName="logs-date-picker"
                showMonthDropdown
                showYearDropdown
                dropdownMode="select"
              />
            </label>
          </div>
        )}

        {error && <div className="logs-error">{error}</div>}

        {logsLoading ? (
          <div className="logs-empty">Loading…</div>
        ) : entries.length === 0 ? (
          <div className="logs-empty">No activity found.</div>
        ) : (
          <>
            <div className="logs-table-wrap">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="logs-timestamp">
                        {formatTimestamp(entry.createdAt)}
                      </td>
                      <td>
                        {entry.user ? (
                          <div className="logs-user-cell">
                            <strong>{entry.user.fullName}</strong>
                            <span>@{entry.user.username}</span>
                          </div>
                        ) : (
                          <span className="logs-muted">System</span>
                        )}
                      </td>
                      <td>
                        <span className={`logs-action logs-action-${actionTone(entry.action)}`}>
                          {formatAction(entry.action)}
                        </span>
                      </td>
                      <td className="logs-details">{formatDetails(entry) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="logs-pagination">
              <span>
                Page {page} of {totalPages} · {total} total
              </span>
              <div className="logs-pagination-buttons">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
