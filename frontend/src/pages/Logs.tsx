import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, Search } from 'lucide-react'
import type { ActiveUser, ActivityLogEntry } from '../lib/logs'
import { logsApi } from '../lib/logs'
import { getSocket } from '../lib/socket'
import { API_BASE_URL } from '../lib/api'
import './Logs.css'

const PAGE_SIZE = 25

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
  if (a.includes('LOGIN') || a.includes('CREATE')) return 'ok'
  if (a.includes('LOGOUT') || a.includes('DELETE') || a.includes('FAIL')) return 'warn'
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
    setLogsLoading(true)
    setError('')
    try {
      const result = await logsApi.list({
        page,
        pageSize: PAGE_SIZE,
        action: actionFilter || undefined,
        search: search || undefined,
      })
      setEntries(result.items)
      setTotal(result.total)
    } catch (err) {
      setError(`Failed to load activity log (${describeError(err)})`)
    } finally {
      setLogsLoading(false)
    }
  }, [page, actionFilter, search])

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
              placeholder="Search by user, action, details…"
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
                {a}
              </option>
            ))}
          </select>
        </div>

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
                    <th>Entity</th>
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
                          {entry.action}
                        </span>
                      </td>
                      <td>
                        <span className="logs-entity">
                          {entry.entity}
                          {entry.entityId ? (
                            <span className="logs-entity-id"> #{entry.entityId.slice(0, 8)}</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="logs-details">{entry.details || '—'}</td>
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