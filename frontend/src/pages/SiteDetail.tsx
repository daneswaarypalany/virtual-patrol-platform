import { useEffect, useState } from 'react'
import type { Site } from '../lib/sites'
import type { AssignedUser } from '../lib/sites'
import { sitesApi } from '../lib/sites'
import { usersApi } from '../lib/users'
import type { AppUser } from '../lib/users'
import './SiteDetail.css'

type Tab = 'operators' | 'cameras' | 'routes'

export default function SiteDetail({
  site,
  onClose,
}: {
  site: Site
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('operators')
  const [assigned, setAssigned] = useState<AssignedUser[]>([])
  const [allUsers, setAllUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [a, u] = await Promise.all([
        sitesApi.getAssignments(site.id),
        usersApi.list(),
      ])
      setAssigned(a)
      setAllUsers(u)
    } catch {
      setError('Failed to load assignments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [site.id])

  // Users who can be assigned = operators/viewers not already assigned, and active
  const assignedIds = new Set(assigned.map((a) => a.id))
  const assignable = allUsers.filter(
    (u) =>
      u.role !== 'ADMIN' &&
      u.status === 'ACTIVE' &&
      !assignedIds.has(u.id),
  )

  const assign = async (userId: string) => {
    try {
      await sitesApi.assignUser(site.id, userId)
      load()
    } catch {
      setError('Failed to assign user')
    }
  }

  const unassign = async (userId: string) => {
    try {
      await sitesApi.unassignUser(site.id, userId)
      load()
    } catch {
      setError('Failed to remove user')
    }
  }

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <div>
            <h2>{site.name}</h2>
            <p>{site.address || 'No address'} · {site.timezone}</p>
          </div>
          <button className="detail-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="detail-tabs">
          <button
            className={tab === 'operators' ? 'active' : ''}
            onClick={() => setTab('operators')}
          >
            Assigned Operators
          </button>
          <button
            className={tab === 'cameras' ? 'active' : ''}
            onClick={() => setTab('cameras')}
          >
            Cameras
          </button>
          <button
            className={tab === 'routes' ? 'active' : ''}
            onClick={() => setTab('routes')}
          >
            Routes
          </button>
        </div>

        <div className="detail-body">
          {error && <div className="detail-error">{error}</div>}

          {tab === 'operators' && (
            <>
              {loading ? (
                <p className="detail-muted">Loading…</p>
              ) : (
                <>
                  <div className="assign-add">
                    <label>Assign a user to this site</label>
                    <select
                      value=""
                      onChange={(e) => e.target.value && assign(e.target.value)}
                    >
                      <option value="">Select a user…</option>
                      {assignable.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.role.toLowerCase()})
                        </option>
                      ))}
                    </select>
                    {assignable.length === 0 && (
                      <p className="detail-muted">
                        No more active operators/viewers available to assign.
                      </p>
                    )}
                  </div>

                  <div className="assigned-list">
                    <p className="assigned-title">
                      {assigned.length} assigned
                    </p>
                    {assigned.length === 0 ? (
                      <p className="detail-muted">
                        No users assigned to this site yet.
                      </p>
                    ) : (
                      assigned.map((u) => (
                        <div key={u.id} className="assigned-row">
                          <div>
                            <strong>{u.fullName}</strong>
                            <span className="assigned-meta">
                              {u.username} · {u.role.toLowerCase()}
                            </span>
                          </div>
                          <button onClick={() => unassign(u.id)}>Remove</button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'cameras' && (
            <div className="detail-placeholder">
              <p>Camera management for this site comes in Module C.</p>
            </div>
          )}

          {tab === 'routes' && (
            <div className="detail-placeholder">
              <p>Route management for this site comes in Module D.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}