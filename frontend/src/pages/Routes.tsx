import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Route, CheckpointInput } from '../lib/routes'
import { routesApi } from '../lib/routes'
import type { Site } from '../lib/sites'
import { sitesApi } from '../lib/sites'
import type { Camera } from '../lib/cameras'
import { camerasApi } from '../lib/cameras'
import type { ChecklistTemplate } from '../lib/checklists'
import { checklistsApi } from '../lib/checklists'
import './Routes.css'

interface DraftCheckpoint {
  key: string
  cameraId: string
  checklistTemplateId: string
}

export default function Routes() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [builder, setBuilder] = useState<Route | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [r, s] = await Promise.all([routesApi.list(), sitesApi.list()])
      setRoutes(r)
      setSites(s)
    } catch {
      setError('Failed to load routes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const remove = async (route: Route) => {
    if (!window.confirm(`Delete route "${route.name}"?`)) return
    try {
      await routesApi.remove(route.id)
      load()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to delete route')
    }
  }

  const filteredRoutes = routes.filter((r) => {
    const q = search.toLowerCase()
    const matchesSearch =
      r.name.toLowerCase().includes(q) ||
      (r.description ?? '').toLowerCase().includes(q)
    const matchesSite = siteFilter === 'all' || r.siteId === siteFilter
    return matchesSearch && matchesSite
  })

  return (
    <div className="routes-page">
      <div className="routes-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              placeholder="Search routes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="site-filter"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
          >
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <button className="btn-primary" onClick={() => setBuilder('new')}>
          + Build Route
        </button>
      </div>

      <p className="routes-count">
        {filteredRoutes.length} of {routes.length} routes
      </p>

      {error && <div className="routes-error">{error}</div>}

      {loading ? (
        <p className="routes-loading">Loading…</p>
      ) : routes.length === 0 ? (
        <div className="routes-empty">
          <p>No routes yet. Build your first patrol route.</p>
        </div>
      ) : filteredRoutes.length === 0 ? (
        <div className="routes-empty">
          <p>No routes match your search or filter.</p>
        </div>
      ) : (
        <div className="routes-list">
          {filteredRoutes.map((r) => (
            <div key={r.id} className="route-card">
              <div className="route-card-main">
                <h3>{r.name}</h3>
                <p className="route-meta">
                  {r.site.name} · {r._count.checkpoints} checkpoints
                  {r.estimatedMinutes ? ` · ~${r.estimatedMinutes} min` : ''}
                </p>
                {r.description && <p className="route-desc">{r.description}</p>}

                <div className="route-flow">
                  {(r.checkpoints.length <= 4
                    ? r.checkpoints
                    : [r.checkpoints[0], r.checkpoints[1]]
                  ).map((cp, i) => (
                    <div key={cp.id} className="flow-node">
                      <span className="flow-num">{i + 1}</span>
                      <div className="flow-info">
                        <strong>{cp.camera.name}</strong>
                        <span>{cp.checklistTemplate.name}</span>
                      </div>
                    </div>
                  ))}

                  {r.checkpoints.length > 4 && (
                    <>
                      <div className="flow-more">
                        +{r.checkpoints.length - 3} more
                      </div>
                      <div className="flow-node">
                        <span className="flow-num">{r.checkpoints.length}</span>
                        <div className="flow-info">
                          <strong>
                            {r.checkpoints[r.checkpoints.length - 1].camera.name}
                          </strong>
                          <span>
                            {
                              r.checkpoints[r.checkpoints.length - 1]
                                .checklistTemplate.name
                            }
                          </span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="route-card-actions">
                <button onClick={() => setBuilder(r)}>Edit</button>
                <button className="danger" onClick={() => remove(r)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {builder && (
        <RouteBuilder
          route={builder === 'new' ? null : builder}
          sites={sites}
          onClose={() => setBuilder(null)}
          onSaved={() => {
            setBuilder(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function RouteBuilder({
  route,
  sites,
  onClose,
  onSaved,
}: {
  route: Route | null
  sites: Site[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(route?.name ?? '')
  const [siteId, setSiteId] = useState(route?.siteId ?? '')
  const [description, setDescription] = useState(route?.description ?? '')
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    route?.estimatedMinutes?.toString() ?? '',
  )
  const [checkpoints, setCheckpoints] = useState<DraftCheckpoint[]>(
    route?.checkpoints.map((cp) => ({
      key: cp.id,
      cameraId: cp.cameraId,
      checklistTemplateId: cp.checklistTemplateId,
    })) ?? [],
  )

  const [cameras, setCameras] = useState<Camera[]>([])
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor))

  useEffect(() => {
    checklistsApi.list().then(setTemplates).catch(() => {})
  }, [])

  useEffect(() => {
    if (!siteId) {
      setCameras([])
      return
    }
    camerasApi.list(siteId).then(setCameras).catch(() => setCameras([]))
  }, [siteId])

  const addCheckpoint = () => {
    setCheckpoints((cps) => [
      ...cps,
      { key: crypto.randomUUID(), cameraId: '', checklistTemplateId: '' },
    ])
  }

  // Suggest a checklist template based on the camera name (keyword match)
  const suggestChecklist = (cameraId: string): string => {
    const cam = cameras.find((c) => c.id === cameraId)
    if (!cam) return ''
    const n = cam.name.toLowerCase()

    const find = (kw: string) =>
      templates.find((t) => t.name.toLowerCase().includes(kw))?.id

    if (n.includes('perimeter')) return find('perimeter') ?? ''
    if (
      n.includes('gate') ||
      n.includes('entrance') ||
      n.includes('lobby') ||
      n.includes('reception') ||
      n.includes('door')
    )
      return find('entrance') ?? find('main') ?? ''
    // fallback: guard / security post checklist
    return find('guard') ?? find('security') ?? ''
  }

  const updateCheckpoint = (
    key: string,
    field: 'cameraId' | 'checklistTemplateId',
    value: string,
  ) => {
    setCheckpoints((cps) =>
      cps.map((cp) => {
        if (cp.key !== key) return cp
        // when camera changes, auto-fill checklist if none chosen yet
        if (field === 'cameraId') {
          const suggested = suggestChecklist(value)
          return {
            ...cp,
            cameraId: value,
            checklistTemplateId: cp.checklistTemplateId || suggested,
          }
        }
        return { ...cp, [field]: value }
      }),
    )
  }

  const removeCheckpoint = (key: string) => {
    setCheckpoints((cps) => cps.filter((cp) => cp.key !== key))
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setCheckpoints((cps) => {
      const oldIndex = cps.findIndex((c) => c.key === active.id)
      const newIndex = cps.findIndex((c) => c.key === over.id)
      return arrayMove(cps, oldIndex, newIndex)
    })
  }

  const submit = async () => {
    setError('')
    if (!name.trim()) return setError('Route name is required')
    if (!siteId) return setError('Select a site')
    if (checkpoints.length === 0) return setError('Add at least one checkpoint')
    if (checkpoints.some((c) => !c.cameraId || !c.checklistTemplateId))
      return setError('Every checkpoint needs a camera and a checklist')

    const payload = {
      name,
      siteId,
      description: description || undefined,
      estimatedMinutes: estimatedMinutes
        ? parseInt(estimatedMinutes, 10)
        : undefined,
      checkpoints: checkpoints.map<CheckpointInput>((c) => ({
        cameraId: c.cameraId,
        checklistTemplateId: c.checklistTemplateId,
      })),
    }

    setSubmitting(true)
    try {
      if (route) {
        await routesApi.update(route.id, payload)
      } else {
        await routesApi.create(payload)
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save route')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="builder-backdrop" onClick={onClose}>
      <div className="builder-panel" onClick={(e) => e.stopPropagation()}>
        <div className="builder-head">
          <h2>{route ? 'Edit Route' : 'Build Route'}</h2>
          <button className="builder-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="builder-body">
          {error && <div className="builder-error">{error}</div>}

          <div className="builder-fields">
            <div className="field">
              <label>Route Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field">
              <label>Site</label>
              <select
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value)
                  setCheckpoints((cps) =>
                    cps.map((c) => ({ ...c, cameraId: '' })),
                  )
                }}
                disabled={!!route}
              >
                <option value="">Select a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Estimated Minutes (optional)</label>
              <input
                type="number"
                min="1"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
              />
            </div>

            <div className="field field-full">
              <label>Description (optional)</label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="checkpoints-section">
            <div className="checkpoints-head">
              <h3>Checkpoints ({checkpoints.length})</h3>
              <button
                className="btn-secondary"
                onClick={addCheckpoint}
                disabled={!siteId}
              >
                + Add Checkpoint
              </button>
            </div>

            {!siteId && (
              <p className="builder-hint">
                Select a site first to add checkpoints.
              </p>
            )}

            {siteId && cameras.length === 0 && (
              <p className="builder-hint">
                This site has no cameras yet. Add cameras before building a
                route.
              </p>
            )}

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={checkpoints.map((c) => c.key)}
                strategy={verticalListSortingStrategy}
              >
                {checkpoints.map((cp, index) => (
                  <SortableCheckpoint
                    key={cp.key}
                    cp={cp}
                    index={index}
                    cameras={cameras}
                    templates={templates}
                    onUpdate={updateCheckpoint}
                    onRemove={removeCheckpoint}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        </div>

        <div className="builder-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : route ? 'Save Route' : 'Create Route'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SortableCheckpoint({
  cp,
  index,
  cameras,
  templates,
  onUpdate,
  onRemove,
}: {
  cp: DraftCheckpoint
  index: number
  cameras: Camera[]
  templates: ChecklistTemplate[]
  onUpdate: (
    key: string,
    field: 'cameraId' | 'checklistTemplateId',
    value: string,
  ) => void
  onRemove: (key: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cp.key })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="checkpoint-row">
      <button className="drag-handle" {...attributes} {...listeners}>
        ⠿
      </button>
      <span className="checkpoint-num">{index + 1}</span>

      <select
        value={cp.cameraId}
        onChange={(e) => onUpdate(cp.key, 'cameraId', e.target.value)}
      >
        <option value="">Camera…</option>
        {cameras.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      <select
        value={cp.checklistTemplateId}
        onChange={(e) => onUpdate(cp.key, 'checklistTemplateId', e.target.value)}
      >
        <option value="">Checklist…</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <button className="checkpoint-remove" onClick={() => onRemove(cp.key)}>
        ✕
      </button>
    </div>
  )
}