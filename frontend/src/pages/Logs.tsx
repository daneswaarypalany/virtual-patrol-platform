import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import type { ActiveUser, ActivityLogEntry } from '../lib/logs'
import { logsApi, formatAction, formatDetails } from '../lib/logs'
import { getSocket } from '../lib/socket'
import { API_BASE_URL } from '../lib/api'
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

          <select
            value={actionFilter}
            onChange={(e) => {
              setActionFilter(e.target.value)
              setPage(1)
            }}
          >
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {formatAction(a)}
              </option>
            ))}
          </select>
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
