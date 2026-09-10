import { useEffect, useState } from 'react'
import type { Site } from '../lib/sites'
import type { AssignedUser } from '../lib/sites'
import { sitesApi } from '../lib/sites'
import { usersApi } from '../lib/users'
import type { AppUser } from '../lib/users'
import type { Camera, CameraInput } from '../lib/cameras'
import { camerasApi } from '../lib/cameras'
import type { Route } from '../lib/routes'
import { routesApi } from '../lib/routes'
import './SiteDetail.css'
import SearchableSelect from '../components/SearchableSelect'

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
  const [cameras, setCameras] = useState<Camera[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCamForm, setShowCamForm] = useState(false)
  const [editingCam, setEditingCam] = useState<Camera | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [a, u, c, r] = await Promise.all([
        sitesApi.getAssignments(site.id),
        usersApi.list(),
        camerasApi.list(site.id),
        routesApi.list(site.id),
      ])
      setAssigned(a)
      setAllUsers(u)
      setCameras(c)
      setRoutes(r)
    } catch {
      setError('Failed to load site details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [site.id])

  const assignedIds = new Set(assigned.map((a) => a.id))
  const assignable = allUsers.filter(
    (u) => u.role !== 'ADMIN' && u.status === 'ACTIVE' && !assignedIds.has(u.id),
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

  const removeCamera = async (cam: Camera) => {
    if (!window.confirm(`Delete camera "${cam.name}"?`)) return
    try {
      await camerasApi.remove(cam.id)
      load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete camera')
    }
  }

  return (
    <div className="detail-backdrop" onClick={onClose}>
      <div className="detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="detail-head">
          <button className="detail-close" onClick={onClose}>
            ✕
          </button>
          <div className="detail-head-top">
            <div className="detail-site-icon">
              {site.name.charAt(0).toUpperCase()}
            </div>
            <div className="detail-head-info">
              <div className="detail-head-title">
                <h2>{site.name}</h2>
                <span
                  className={`detail-status ${
                    site.isActive ? 'ds-active' : 'ds-inactive'
                  }`}
                >
                  {site.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <p>
                {site.address || 'No address'} · {site.timezone}
              </p>
            </div>
          </div>

          <div className="detail-stats-row">
            <div className="detail-stat">
              <strong>{assigned.length}</strong>
              <span>Operators</span>
            </div>
            <div className="detail-stat">
              <strong>{cameras.length}</strong>
              <span>Cameras</span>
            </div>
            <div className="detail-stat">
              <strong>{routes.length}</strong>
              <span>Routes</span>
            </div>
          </div>
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
            Cameras ({cameras.length})
          </button>
          <button
            className={tab === 'routes' ? 'active' : ''}
            onClick={() => setTab('routes')}
          >
            Routes ({routes.length})
          </button>
        </div>

        <div className="detail-body">
          {error && <div className="detail-error">{error}</div>}

          {loading ? (
            <p className="detail-muted">Loading…</p>
          ) : (
            <>
              {/* ---------- Operators ---------- */}
              {tab === 'operators' && (
                <>
                  <div className="assign-add">
                    <label>Assign a user to this site</label>
                    <SearchableSelect
                      value=""
                      onChange={(v) => v && assign(v)}
                      placeholder="Select a user…"
                      options={assignable.map((u) => ({
                        value: u.id,
                        label: u.fullName,
                        sub: `${u.username} · ${u.role.toLowerCase()}`,
                      }))}
                    />
                    {assignable.length === 0 && (
                      <p className="detail-muted">
                        No more active operators/viewers available to assign.
                      </p>
                    )}
                  </div>

                  <div className="assigned-list">
                    <p className="assigned-title">{assigned.length} assigned</p>
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

              {/* ---------- Cameras ---------- */}
              {tab === 'cameras' && (
                <>
                  <div className="detail-tab-head">
                    <p className="assigned-title">{cameras.length} cameras</p>
                    <button
                      className="detail-add-btn"
                      onClick={() => {
                        setEditingCam(null)
                        setShowCamForm(true)
                      }}
                    >
                      + Add Camera
                    </button>
                  </div>

                  {cameras.length === 0 ? (
                    <p className="detail-muted">
                      No cameras at this site yet. Add the first one.
                    </p>
                  ) : (
                    cameras.map((cam) => (
                      <div key={cam.id} className="detail-item">
                        <div>
                          <strong>{cam.name}</strong>
                          <span className="detail-item-meta">
                            {cam.cameraCode} · {cam.location || 'No location'}
                          </span>
                        </div>
                        <div className="detail-item-actions">
                          <button
                            onClick={() => {
                              setEditingCam(cam)
                              setShowCamForm(true)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="danger"
                            onClick={() => removeCamera(cam)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}

              {/* ---------- Routes ---------- */}
              {tab === 'routes' && (
                <>
                  <p className="assigned-title">{routes.length} routes</p>
                  {routes.length === 0 ? (
                    <p className="detail-muted">
                      No routes for this site yet. Build one from the Route
                      Builder screen.
                    </p>
                  ) : (
                    routes.map((r) => (
                      <div key={r.id} className="detail-item">
                        <div>
                          <strong>{r.name}</strong>
                          <span className="detail-item-meta">
                            {r._count.checkpoints} checkpoints
                            {r.estimatedMinutes
                              ? ` · ~${r.estimatedMinutes} min`
                              : ''}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                  <p className="detail-hint">
                    To build or edit routes, use the Route Builder screen.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {showCamForm && (
        <CameraForm
          camera={editingCam}
          siteId={site.id}
          onClose={() => setShowCamForm(false)}
          onSaved={() => {
            setShowCamForm(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function CameraForm({
  camera,
  siteId,
  onClose,
  onSaved,
}: {
  camera: Camera | null
  siteId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<CameraInput>({
    name: camera?.name ?? '',
    cameraCode: camera?.cameraCode ?? '',
    siteId,
    location: camera?.location ?? '',
    streamUrl: camera?.streamUrl ?? '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field: keyof CameraInput, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const submit = async () => {
    setError('')
    if (!form.name.trim()) return setError('Camera name is required')
    if (!form.cameraCode.trim()) return setError('Camera code is required')
    setSubmitting(true)
    try {
      if (camera) {
        await camerasApi.update(camera.id, {
          name: form.name,
          cameraCode: form.cameraCode,
          location: form.location,
          streamUrl: form.streamUrl,
        })
      } else {
        await camerasApi.create(form)
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save camera')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{camera ? 'Edit Camera' : 'Add Camera'}</h3>

        <label>Camera Name</label>
        <input
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="e.g. Main Gate"
          autoFocus
        />

        <label>Camera Code</label>
        <input
          value={form.cameraCode}
          onChange={(e) => update('cameraCode', e.target.value)}
          placeholder="e.g. CAM-001"
        />

        <label>Location</label>
        <input
          value={form.location}
          onChange={(e) => update('location', e.target.value)}
          placeholder="e.g. Front entrance"
        />

        <label>Stream URL (optional)</label>
        <input
          value={form.streamUrl}
          onChange={(e) => update('streamUrl', e.target.value)}
          placeholder="e.g. rtsp://admin:password@192.168.1.64:554/stream1"
        />
        <span className="field-hint">
          Paste the camera's RTSP link straight from its manual/app — no need
          to set up your own streaming server first.
        </span>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : camera ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}