import { useEffect, useState } from 'react'
import { RefreshCw, Trash2, X } from 'lucide-react'
import type { ActivePatrolItem } from '../lib/patrol'
import { patrolApi } from '../lib/patrol'
import './ActivePatrols.css'
import { useAppDialog } from '../components/AppDialogProvider'

export default function ActivePatrols() {
  const { confirm, alert: showAlert } = useAppDialog()
  const [items, setItems] = useState<ActivePatrolItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

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

  const enterSelectMode = () => {
    setSelectMode(true)
    setSelected(new Set())
  }

  const cancelSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const toggleSelected = (jobId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(jobId)) next.delete(jobId)
      else next.add(jobId)
      return next
    })
  }

  const allSelected = items.length > 0 && selected.size === items.length
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(items.map((j) => j.id)))
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    const accepted = await confirm({
      title: `Permanently delete ${selected.size} patrol${selected.size > 1 ? 's' : ''}?`,
      message: `This permanently removes the selected patrol job${selected.size > 1 ? 's' : ''}, checkpoint results and associated screenshots. This action cannot be undone.`,
      tone: 'danger',
      confirmLabel: 'Delete permanently',
      cancelLabel: 'Keep patrols',
    })
    if (!accepted) return
    setDeleting(true)
    setError('')
    try {
      await Promise.all(
        Array.from(selected).map((id) => patrolApi.adminDelete(id)),
      )
      setSelectMode(false)
      setSelected(new Set())
      await load()
    } catch {
      await showAlert({ title: 'Patrol deletion failed', message: 'One or more patrol records could not be deleted. Refresh the list and try again.', tone: 'danger' })
    } finally {
      setDeleting(false)
    }
  }

  const fmt = (d: string) => new Date(d).toLocaleString()

  return (
    <div className="active-page">
      <div className="active-toolbar">
        {selectMode ? (
          <>
            <div className="active-select-info">
              <label className="active-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
                {selected.size > 0
                  ? `${selected.size} selected`
                  : 'Select all'}
              </label>
            </div>
            <div className="active-select-actions">
              <button
                className="active-cancel"
                onClick={cancelSelectMode}
                disabled={deleting}
              >
                <X size={14} /> Cancel
              </button>
              <button
                className="active-delete-confirm"
                onClick={deleteSelected}
                disabled={selected.size === 0 || deleting}
              >
                <Trash2 size={14} />
                {deleting
                  ? 'Deleting…'
                  : `Delete${selected.size ? ` (${selected.size})` : ''}`}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="active-count">{items.length} active / draft patrols</p>
            <div className="active-toolbar-actions">
              <button className="active-refresh" onClick={load}>
                <RefreshCw size={14} /> Refresh
              </button>
              {items.length > 0 && (
                <button
                  className="active-delete-toggle"
                  onClick={enterSelectMode}
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
            </div>
          </>
        )}
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
                {selectMode && <th className="active-select-col" />}
                <th>Site</th>
                <th>Route</th>
                <th>Operator</th>
                <th>Status</th>
                <th>Started</th>
                <th>Last Activity</th>
                <th>Stopped At</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr
                  key={j.id}
                  className={`${selected.has(j.id) ? 'row-selected' : ''} ${
                    selectMode ? 'row-clickable' : ''
                  }`}
                  onClick={() => selectMode && toggleSelected(j.id)}
                >
                  {selectMode && (
                    <td
                      className="active-select-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(j.id)}
                        onChange={() => toggleSelected(j.id)}
                        aria-label={`Select patrol for ${j.route.name}`}
                      />
                    </td>
                  )}
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
                  <td className="active-stopped">
                    {j.lastCheckpoint ? (
                      <>
                        <span
                          className={`stopped-dot ${
                            j.lastCheckpoint.allClear ? '' : 'issue'
                          }`}
                        />
                        <div className="stopped-text">
                          <strong>{j.lastCheckpoint.name}</strong>
                          <span>
                            checkpoint {j.lastCheckpoint.orderIndex + 1} of{' '}
                            {j.totalCheckpoints}
                          </span>
                          {j.nextCheckpoint && (
                            <span className="stopped-next">
                              Next: {j.nextCheckpoint.name}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <span className="stopped-none">
                        Not started
                        {j.nextCheckpoint &&
                          ` — first: ${j.nextCheckpoint.name}`}
                      </span>
                    )}
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