import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { Camera, CameraInput } from '../lib/cameras'
import { camerasApi } from '../lib/cameras'
import type { Site } from '../lib/sites'
import { sitesApi } from '../lib/sites'
import './Cameras.css'

export default function Cameras() {
  const [sites, setSites] = useState<Site[]>([])
  const [siteId, setSiteId] = useState('')
  const [cameras, setCameras] = useState<Camera[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Camera | null>(null)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    sitesApi.list().then(setSites).catch(() => {})
  }, [])

  const loadCameras = async () => {
    if (!siteId) {
      setCameras([])
      return
    }
    setLoading(true)
    setError('')
    try {
      setCameras(await camerasApi.list(siteId))
    } catch {
      setError('Failed to load cameras')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadCameras()
  }, [siteId])

  const openCreate = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (cam: Camera) => {
    setEditing(cam)
    setShowForm(true)
  }

  const remove = async (cam: Camera) => {
    if (!window.confirm(`Delete camera "${cam.name}"?`)) return
    try {
      await camerasApi.remove(cam.id)
      loadCameras()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete camera')
    }
  }

  const filtered = cameras.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      c.cameraCode.toLowerCase().includes(q) ||
      (c.location ?? '').toLowerCase().includes(q)
    )
  })

  const selectedSite = sites.find((s) => s.id === siteId)

  return (
    <div className="cameras-page">
      <div
        style={{
          padding: 16,
          background: '#cf5b5b',
          color: 'white',
          borderRadius: 8,
          marginBottom: 16,
          fontWeight: 700,
        }}
      >
        DEBUG: Cameras component is rendering. Sites loaded: {sites.length}
      </div>

      <div className="cam-site-bar">
        <div className="cam-site-select">
          <label>Setting up cameras for</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Select a site…</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {siteId && (
          <button className="btn-primary" onClick={openCreate}>
            + Add Camera
          </button>
        )}
      </div>

      {!siteId ? (
        <div className="cam-empty">
          <p>Select a site above to manage its cameras.</p>
        </div>
      ) : (
        <>
          <div className="cam-toolbar">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                placeholder="Search cameras…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="cam-count">
              {filtered.length} of {cameras.length} cameras at{' '}
              {selectedSite?.name}
            </p>
          </div>

          {error && <div className="cam-error">{error}</div>}

          {loading ? (
            <p className="cam-loading">Loading…</p>
          ) : cameras.length === 0 ? (
            <div className="cam-empty">
              <p>No cameras at this site yet. Add your first camera.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="cam-empty">
              <p>No cameras match your search.</p>
            </div>
          ) : (
            <div className="cam-grid">
              {filtered.map((cam) => (
                <div key={cam.id} className="cam-card">
                  <div className="cam-card-head">
                    <div>
                      <h3>{cam.name}</h3>
                      <span className="cam-code">{cam.cameraCode}</span>
                    </div>
                    <span className={`cam-status cam-${cam.status.toLowerCase()}`}>
                      {cam.status}
                    </span>
                  </div>
                  <p className="cam-location">
                    {cam.location || 'No location set'}
                  </p>
                  {cam.streamUrl && (
                    <p className="cam-stream">🔗 Stream configured</p>
                  )}
                  {cam._count && cam._count.checkpoints > 0 && (
                    <p className="cam-inuse">
                      Used in {cam._count.checkpoints} checkpoint(s)
                    </p>
                  )}
                  <div className="cam-actions">
                    <button onClick={() => openEdit(cam)}>Edit</button>
                    <button className="danger" onClick={() => remove(cam)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showForm && siteId && (
        <CameraModal
          camera={editing}
          siteId={siteId}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            loadCameras()
          }}
        />
      )}
    </div>
  )
}

function CameraModal({
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
          placeholder="e.g. http://localhost:8888/cam1/index.m3u8"
        />

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