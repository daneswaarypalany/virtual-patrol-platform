import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import type { ActivePatrolItem } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import './ActivePatrols.css'

export default function ActivePatrols() {
  const [items, setItems] = useState<ActivePatrolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setItems(await patrolApi.listActive())
    } catch {
      setError('Failed to load active patrols')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const release = async (jobId: string) => {
    if (
      !window.confirm(
        'Release the site lock? The patrol job stays, but the site becomes available for a new patrol.',
      )
    )
      return
    try {
      await patrolApi.releaseLock(jobId)
      load()
    } catch {
      setError('Failed to release lock')
    }
  }

  const remove = async (jobId: string) => {
    if (
      !window.confirm(
        'Delete this patrol entirely? This removes the job and all its checkpoint results permanently.',
      )
    )
      return
    try {
      await patrolApi.adminDelete(jobId)
      load()
    } catch {
      setError('Failed to delete patrol')
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleString()

  return (
    <div className="active-page">
      <div className="active-toolbar">
        <p className="active-count">{items.length} active / draft patrols</p>
        <button className="active-refresh" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="active-error">{error}</div>}

      {loading ? (
        <p className="active-loading">Loading…</p>
      ) : items.length === 0 ? (
        <div className="active-empty">
          <p>No active or draft patrols. All sites are available.</p>
        </div>
      ) : (
        <div className="active-table-wrap">
          <table className="active-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Route</th>
                <th>Operator</th>
                <th>Status</th>
                <th>Started</th>
                <th>Last Activity</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.id}>
                  <td className="active-site">{j.route.site.name}</td>
                  <td>{j.route.name}</td>
                  <td>{j.operator.fullName}</td>
                  <td>
                    <span
                      className={`active-status ${
                        j.status === 'DRAFT' ? 'st-draft' : 'st-progress'
                      }`}
                    >
                      {j.status === 'DRAFT' ? 'DRAFT' : 'IN PROGRESS'}
                    </span>
                  </td>
                  <td>{fmt(j.startedAt)}</td>
                  <td>{fmt(j.lastActivityAt)}</td>
                  <td>{j._count.results} checkpoints</td>
                  <td className="active-actions">
                    {j.activePatrol && (
                      <button onClick={() => release(j.id)}>
                        Release Lock
                      </button>
                    )}
                    <button className="danger" onClick={() => remove(j.id)}>
                      Delete
                    </button>
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