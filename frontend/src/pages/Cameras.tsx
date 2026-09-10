import { useEffect, useState } from 'react'
import { Search, Camera as CamIcon, X } from 'lucide-react'
import type { Camera, CameraInput } from '../lib/cameras'
import { camerasApi } from '../lib/cameras'
import type { Site } from '../lib/sites'
import { sitesApi } from '../lib/sites'
import ViewToggle, { type ViewMode } from '../components/ViewToggle'
import './Cameras.css'

export default function Cameras() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>('grid')
  const [activeSite, setActiveSite] = useState<Site | null>(null)

  const loadSites = async () => {
    setLoading(true)
    setError('')
    try {
      setSites(await sitesApi.list())
    } catch {
      setError('Failed to load sites')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSites()
  }, [])

  const filtered = sites.filter((s) => {
    const q = search.toLowerCase()
    return (
      s.name.toLowerCase().includes(q) ||
      (s.address ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="cameras-page">
      <div className="cameras-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              placeholder="Search sites…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          <ViewToggle mode={view} onChange={setView} />
        </div>
      </div>

      <p className="cameras-count">
        {filtered.length} of {sites.length} sites — select a site to manage its
        cameras
      </p>

      {error && <div className="cameras-error">{error}</div>}

      {loading ? (
        <p className="cameras-loading">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="cameras-empty">
          <p>No sites match your search.</p>
        </div>
      ) : view === 'grid' ? (
        <div className="site-cam-grid">
          {filtered.map((s) => (
            <button
              key={s.id}
              className="site-cam-card"
              onClick={() => setActiveSite(s)}
            >
              <div className="site-cam-icon">
                <CamIcon size={20} />
              </div>
              <div className="site-cam-info">
                <strong>{s.name}</strong>
                <span>{s._count.cameras} cameras</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="site-cam-list">
          {filtered.map((s) => (
            <button
              key={s.id}
              className="site-cam-row"
              onClick={() => setActiveSite(s)}
            >
              <div className="site-cam-icon sm">
                <CamIcon size={16} />
              </div>
              <strong>{s.name}</strong>
              <span className="site-cam-addr">{s.address || '—'}</span>
              <span className="site-cam-badge">{s._count.cameras} cameras</span>
            </button>
          ))}
        </div>
      )}

      {activeSite && (
        <SiteCamerasPopup
          site={activeSite}
          onClose={() => {
            setActiveSite(null)
            loadSites() // refresh counts
          }}
        />
      )}
    </div>
  )
}

function SiteCamerasPopup({
  site,
  onClose,
}: {
  site: Site
  onClose: () => void
}) {
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Camera | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setCameras(await camerasApi.list(site.id))
    } catch {
      setError('Failed to load cameras')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [site.id])

  const remove = async (cam: Camera) => {
    if (!window.confirm(`Delete camera "${cam.name}"?`)) return
    try {
      await camerasApi.remove(cam.id)
      load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete camera')
    }
  }

  return (
    <div className="cam-popup-backdrop" onClick={onClose}>
      <div className="cam-popup" onClick={(e) => e.stopPropagation()}>
        <div className="cam-popup-head">
          <div>
            <h3>{site.name}</h3>
            <span>{cameras.length} cameras</span>
          </div>
          <div className="cam-popup-head-actions">
            <button
              className="cam-add-btn"
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
            >
              + Add Camera
            </button>
            <button className="cam-popup-close" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="cam-popup-body">
          {error && <div className="cameras-error">{error}</div>}
          {loading ? (
            <p className="cameras-loading">Loading…</p>
          ) : cameras.length === 0 ? (
            <p className="cameras-muted">
              No cameras at this site yet. Add the first one.
            </p>
          ) : (
            cameras.map((cam) => (
              <div key={cam.id} className="cam-row">
                <div className="cam-row-icon">
                  <CamIcon size={16} />
                </div>
                <div className="cam-row-info">
                  <strong>{cam.name}</strong>
                  <span>
                    {cam.cameraCode} · {cam.location || 'No location'}
                  </span>
                </div>
                <div className="cam-row-actions">
                  <button
                    onClick={() => {
                      setEditing(cam)
                      setShowForm(true)
                    }}
                  >
                    Edit
                  </button>
                  <button className="danger" onClick={() => remove(cam)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {showForm && (
        <CameraForm
          camera={editing}
          siteId={site.id}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
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