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
import type { ReportTemplateSummary } from '../lib/report-template'
import { reportTemplateApi } from '../lib/report-template'
import type {
  SiteCommunicationChannel,
  ChannelType,
  TestResult,
} from '../lib/site-communications'
import { siteCommunicationsApi } from '../lib/site-communications'
import './SiteDetail.css'
import SearchableSelect from '../components/SearchableSelect'

type Section = 'operators' | 'template' | 'cameras' | 'routes' | 'communications'

export default function SiteDetail({
  site,
  onClose,
}: {
  site: Site
  onClose: () => void
}) {
  const [openSections, setOpenSections] = useState<Set<Section>>(
    new Set(['operators']),
  )
  const toggleSection = (s: Section) =>
    setOpenSections((prev) => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  const [assigned, setAssigned] = useState<AssignedUser[]>([])
  const [allUsers, setAllUsers] = useState<AppUser[]>([])
  const [cameras, setCameras] = useState<Camera[]>([])
  const [routes, setRoutes] = useState<Route[]>([])
  const [templates, setTemplates] = useState<ReportTemplateSummary[]>([])
  const [templateId, setTemplateId] = useState<string | null>(site.reportTemplateId)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [channels, setChannels] = useState<SiteCommunicationChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [showCamForm, setShowCamForm] = useState(false)
  const [editingCam, setEditingCam] = useState<Camera | null>(null)

  const [commFormType, setCommFormType] = useState<ChannelType | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [testingId, setTestingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [a, u, c, r, t, comms] = await Promise.all([
        sitesApi.getAssignments(site.id),
        usersApi.list(),
        camerasApi.list(site.id),
        routesApi.list(site.id),
        reportTemplateApi.list(),
        siteCommunicationsApi.list(site.id),
      ])
      setAssigned(a)
      setAllUsers(u)
      setCameras(c)
      setRoutes(r)
      setTemplates(t)
      setChannels(comms)
    } catch {
      setError('Failed to load site details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    setTemplateId(site.reportTemplateId)
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

  const changeTemplate = async (id: string) => {
    const nextId = id || null
    const prevId = templateId
    setTemplateId(nextId) // optimistic
    setSavingTemplate(true)
    try {
      await sitesApi.setTemplate(site.id, nextId)
    } catch {
      setTemplateId(prevId)
      setError('Failed to update report template')
    } finally {
      setSavingTemplate(false)
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

  const toggleChannel = async (channel: SiteCommunicationChannel) => {
    try {
      await siteCommunicationsApi.update(site.id, channel.id, {
        enabled: !channel.enabled,
      })
      load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update channel')
    }
  }

  const removeChannel = async (channel: SiteCommunicationChannel) => {
    if (!window.confirm(`Remove the ${channel.channelType} channel for this site?`))
      return
    try {
      await siteCommunicationsApi.remove(site.id, channel.id)
      load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to remove channel')
    }
  }

  const testChannel = async (channel: SiteCommunicationChannel) => {
    setTestingId(channel.id)
    try {
      const result = await siteCommunicationsApi.test(site.id, channel.id)
      setTestResults((r) => ({ ...r, [channel.id]: result }))
    } catch (err: any) {
      setTestResults((r) => ({
        ...r,
        [channel.id]: {
          status: 'FAILED',
          errorMessage: err?.response?.data?.message || 'Test request failed',
        },
      }))
    } finally {
      setTestingId(null)
    }
  }

  const CHANNEL_LABELS: Record<ChannelType, string> = {
    WHATSAPP: 'WhatsApp',
    TELEGRAM: 'Telegram',
    EMAIL: 'Email',
  }
  const CHANNEL_HINTS: Record<ChannelType, string> = {
    WHATSAPP:
      'Phone number / approved recipient identifier, or a WhatsApp group invite link (chat.whatsapp.com/...)',
    TELEGRAM: 'Chat ID or channel ID',
    EMAIL: 'Recipient email address (comma-separate for multiple)',
  }

  const isLink = (value: string) => /^https?:\/\//i.test(value.trim())

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

        <div className="detail-body">
          {error && <div className="detail-error">{error}</div>}

          {loading ? (
            <p className="detail-muted">Loading…</p>
          ) : (
            <>
              {/* ---------- Operators ---------- */}
              <div className="section-label">Operators</div>
              <div className={`acc-card${openSections.has('operators') ? ' open' : ''}`}>
                <div
                  className="acc-card-head"
                  onClick={() => toggleSection('operators')}
                >
                  <div className="acc-card-head-left">
                    <div className="acc-card-title">Assigned operators</div>
                    <div className="acc-card-meta">
                      {assigned.length} assigned
                    </div>
                  </div>
                  <div className="acc-card-right">
                    <span className="count-pill">{assigned.length}</span>
                    <svg
                      className="chev"
                      viewBox="0 0 20 20"
                      fill="none"
                      width="18"
                      height="18"
                    >
                      <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="acc-card-body">
                  <div className="acc-card-body-inner">
                    <div className="acc-card-body-content">
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
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------- Report Template ---------- */}
              <div className="section-label">Report template</div>
              <div className={`acc-card${openSections.has('template') ? ' open' : ''}`}>
                <div
                  className="acc-card-head"
                  onClick={() => toggleSection('template')}
                >
                  <div className="acc-card-head-left">
                    <div className="acc-card-title">Report template</div>
                    <div className="acc-card-meta">
                      {templates.find((t) => t.id === templateId)?.name ??
                        'Default template'}
                    </div>
                  </div>
                  <div className="acc-card-right">
                    <svg
                      className="chev"
                      viewBox="0 0 20 20"
                      fill="none"
                      width="18"
                      height="18"
                    >
                      <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="acc-card-body">
                  <div className="acc-card-body-inner">
                    <div className="acc-card-body-content">
                  <div className="assign-add">
                    <label>Report template for this site</label>
                    <SearchableSelect
                      value={templateId ?? ''}
                      onChange={(v) => changeTemplate(v)}
                      placeholder="Default Template"
                      searchable={false}
                      options={templates.map((t) => ({
                        value: t.id,
                        label: t.isDefault ? `${t.name} (Default)` : t.name,
                      }))}
                    />
                    <p className="detail-muted">
                      {savingTemplate
                        ? 'Saving…'
                        : 'Used when generating reports for patrols at this site. Manage the templates themselves from the Reports → Templates screen.'}
                    </p>
                  </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------- Cameras ---------- */}
              <div className="section-label">Cameras &amp; routes</div>
              <div className={`acc-card${openSections.has('cameras') ? ' open' : ''}`}>
                <div
                  className="acc-card-head"
                  onClick={() => toggleSection('cameras')}
                >
                  <div className="acc-card-head-left">
                    <div className="acc-card-title">Cameras</div>
                    <div className="acc-card-meta">{cameras.length} at this site</div>
                  </div>
                  <div className="acc-card-right">
                    <span className="count-pill">{cameras.length}</span>
                    <svg
                      className="chev"
                      viewBox="0 0 20 20"
                      fill="none"
                      width="18"
                      height="18"
                    >
                      <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="acc-card-body">
                  <div className="acc-card-body-inner">
                    <div className="acc-card-body-content">
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
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------- Routes ---------- */}
              <div className={`acc-card${openSections.has('routes') ? ' open' : ''}`}>
                <div
                  className="acc-card-head"
                  onClick={() => toggleSection('routes')}
                >
                  <div className="acc-card-head-left">
                    <div className="acc-card-title">Patrol routes</div>
                    <div className="acc-card-meta">{routes.length} configured</div>
                  </div>
                  <div className="acc-card-right">
                    <span className="count-pill">{routes.length}</span>
                    <svg
                      className="chev"
                      viewBox="0 0 20 20"
                      fill="none"
                      width="18"
                      height="18"
                    >
                      <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="acc-card-body">
                  <div className="acc-card-body-inner">
                    <div className="acc-card-body-content">
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
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------- Communications ---------- */}
              <div className="section-label">Communications</div>
              <div className={`acc-card${openSections.has('communications') ? ' open' : ''}`}>
                <div
                  className="acc-card-head"
                  onClick={() => toggleSection('communications')}
                >
                  <div className="acc-card-head-left">
                    <div className="acc-card-title">Notification channels</div>
                    <div className="acc-card-meta">
                      {channels.filter((c) => c.enabled).length} of 3 enabled
                    </div>
                  </div>
                  <div className="acc-card-right">
                    <svg
                      className="chev"
                      viewBox="0 0 20 20"
                      fill="none"
                      width="18"
                      height="18"
                    >
                      <path
                        d="M5 7.5L10 12.5L15 7.5"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </div>
                <div className="acc-card-body">
                  <div className="acc-card-body-inner">
                    <div className="acc-card-body-content">
                  <p className="assigned-title">
                    Site-specific WhatsApp, Telegram and Email destinations.
                    Only this site's channels are used when it has an event.
                  </p>

                  {(['WHATSAPP', 'TELEGRAM', 'EMAIL'] as ChannelType[]).map((type) => {
                    const channel = channels.find((c) => c.channelType === type)
                    const result = channel ? testResults[channel.id] : undefined
                    return (
                      <div key={type} className="detail-item comm-item">
                        <div>
                          <strong>{CHANNEL_LABELS[type]}</strong>
                          {channel ? (
                            <span className="detail-item-meta">
                              {channel.displayName
                                ? `${channel.displayName} · `
                                : ''}
                              {isLink(channel.destination) ? (
                                <a
                                  href={channel.destination}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="comm-link"
                                >
                                  {channel.destination}
                                </a>
                              ) : (
                                channel.destination
                              )}
                            </span>
                          ) : (
                            <span className="detail-item-meta">
                              Not configured
                            </span>
                          )}
                          {result && (
                            <span
                              className={`comm-test-result comm-${result.status.toLowerCase()}`}
                            >
                              {result.status === 'SENT' &&
                                '✓ Test message sent successfully'}
                              {result.status === 'CONFIGURATION_REQUIRED' &&
                                'Configuration Required'}
                              {result.status === 'FAILED' &&
                                `✕ Test message failed${
                                  result.errorMessage
                                    ? ` — ${result.errorMessage}`
                                    : ''
                                }`}
                            </span>
                          )}
                        </div>
                        <div className="detail-item-actions">
                          {channel ? (
                            <>
                              {isLink(channel.destination) && (
                                <a
                                  href={channel.destination}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-link-open"
                                >
                                  Open
                                </a>
                              )}
                              <button
                                type="button"
                                className={`toggle${channel.enabled ? ' on' : ''}`}
                                onClick={() => toggleChannel(channel)}
                                aria-pressed={channel.enabled}
                                title={channel.enabled ? 'Enabled' : 'Disabled'}
                              >
                                <span className="toggle-knob" />
                              </button>
                              <button
                                onClick={() => testChannel(channel)}
                                disabled={testingId === channel.id}
                              >
                                {testingId === channel.id
                                  ? 'Testing…'
                                  : 'Test'}
                              </button>
                              <button onClick={() => setCommFormType(type)}>
                                Edit
                              </button>
                              <button
                                className="danger"
                                onClick={() => removeChannel(channel)}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <button
                              className="detail-add-btn"
                              onClick={() => setCommFormType(type)}
                            >
                              + Configure
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="detail-foot">
          <div className="detail-foot-status">
            <span className="foot-dot" />
            All changes saved
          </div>
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
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

      {commFormType && (
        <CommunicationForm
          siteId={site.id}
          channelType={commFormType}
          existing={channels.find((c) => c.channelType === commFormType) ?? null}
          hint={CHANNEL_HINTS[commFormType]}
          label={CHANNEL_LABELS[commFormType]}
          onClose={() => setCommFormType(null)}
          onSaved={() => {
            setCommFormType(null)
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

function CommunicationForm({
  siteId,
  channelType,
  existing,
  hint,
  label,
  onClose,
  onSaved,
}: {
  siteId: string
  channelType: ChannelType
  existing: SiteCommunicationChannel | null
  hint: string
  label: string
  onClose: () => void
  onSaved: () => void
}) {
  const [destination, setDestination] = useState(existing?.destination ?? '')
  const [displayName, setDisplayName] = useState(existing?.displayName ?? '')
  const [enabled, setEnabled] = useState(existing?.enabled ?? true)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    setError('')
    if (!destination.trim()) return setError(`${label} destination is required`)
    setSubmitting(true)
    try {
      if (existing) {
        await siteCommunicationsApi.update(siteId, existing.id, {
          destination,
          displayName: displayName || undefined,
          enabled,
        })
      } else {
        await siteCommunicationsApi.create(siteId, {
          channelType,
          destination,
          displayName: displayName || undefined,
          enabled,
        })
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message || `Failed to save ${label} channel`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{existing ? `Edit ${label}` : `Configure ${label}`}</h3>

        <label>Destination</label>
        <input
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          placeholder={hint}
          autoFocus
        />
        <span className="field-hint">{hint}</span>

        <label>Display Label (optional)</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Site security desk"
        />

        <div className="toggle-row">
          <div>
            <strong>Enabled</strong>
            <span>Whether this channel receives automatic notifications.</span>
          </div>
          <button
            type="button"
            className={`toggle${enabled ? ' on' : ''}`}
            onClick={() => setEnabled((e) => !e)}
            aria-pressed={enabled}
          >
            <span className="toggle-knob" />
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : existing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}