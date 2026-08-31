import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import type { ChecklistTemplate, ChecklistInput } from '../lib/checklists'
import { checklistsApi } from '../lib/checklists'
import './Checklists.css'

type SortKey = 'name' | 'mostUsed' | 'newest'
type UsageFilter = 'all' | 'used' | 'unused'

export default function Checklists() {
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<ChecklistTemplate | null>(null)
  const [showForm, setShowForm] = useState(false)

  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [usage, setUsage] = useState<UsageFilter>('all')
  const [category, setCategory] = useState('all')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setTemplates(await checklistsApi.list())
    } catch {
      setError('Failed to load checklist templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (t: ChecklistTemplate) => {
    setEditing(t)
    setShowForm(true)
  }

  const remove = async (t: ChecklistTemplate) => {
    if (t._count && t._count.checkpoints > 0) {
      alert(
        `"${t.name}" is used by ${t._count.checkpoints} checkpoint(s) and can't be deleted. Remove it from those routes first.`,
      )
      return
    }
    if (!window.confirm(`Delete checklist "${t.name}"?`)) return
    try {
      await checklistsApi.remove(t.id)
      load()
    } catch {
      setError('Failed to delete template (it may be in use by a route)')
    }
  }

  // Unique categories present in the data (for the filter dropdown)
  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter(Boolean)),
  ) as string[]

  const visible = templates
    .filter((t) => {
      const q = search.toLowerCase()
      const matchesSearch =
        t.name.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      const used = (t._count?.checkpoints ?? 0) > 0
      const matchesUsage =
        usage === 'all' ||
        (usage === 'used' && used) ||
        (usage === 'unused' && !used)
      const matchesCategory = category === 'all' || t.category === category
      return matchesSearch && matchesUsage && matchesCategory
    })
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'mostUsed')
        return (b._count?.checkpoints ?? 0) - (a._count?.checkpoints ?? 0)
      // newest — assumes list came back newest-first already; keep stable
      return 0
    })

  return (
    <div className="checklists-page">
      <div className="checklists-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              placeholder="Search templates…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className="cl-select">
            <option value="name">Sort: Name</option>
            <option value="mostUsed">Sort: Most used</option>
            <option value="newest">Sort: Newest</option>
          </select>

          <select value={usage} onChange={(e) => setUsage(e.target.value as UsageFilter)} className="cl-select">
            <option value="all">All</option>
            <option value="used">In use</option>
            <option value="unused">Unused</option>
          </select>

          {categories.length > 0 && (
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="cl-select">
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        <button className="btn-primary" onClick={openCreate}>
          + New Template
        </button>
      </div>

      <p className="checklists-count">
        {visible.length} of {templates.length} templates
      </p>

      {error && <div className="checklists-error">{error}</div>}

      {loading ? (
        <p className="checklists-loading">Loading…</p>
      ) : templates.length === 0 ? (
        <div className="checklists-empty">
          <p>No checklist templates yet. Create one to use in your routes.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="checklists-empty">
          <p>No templates match your search or filters.</p>
        </div>
      ) : (
        <div className="checklists-grid">
          {visible.map((t) => (
            <div key={t.id} className="checklist-card">
              <div className="checklist-card-head">
                <div>
                  <h3>{t.name}</h3>
                  {t.category && (
                    <span className="category-tag">{t.category}</span>
                  )}
                </div>
                <span className="usage-badge">
                  {t._count?.checkpoints ?? 0} in use
                </span>
              </div>
              {t.description && (
                <p className="checklist-desc">{t.description}</p>
              )}
              <div className="checklist-items">
                {t.items.map((item) => (
                  <div key={item.id} className="checklist-item-row">
                    <span className="item-circle" />
                    <span className="item-label">{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="checklist-card-actions">
                <button onClick={() => openEdit(t)}>Edit</button>
                <button className="danger" onClick={() => remove(t)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <ChecklistModal
          template={editing}
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

function ChecklistModal({
  template,
  onClose,
  onSaved,
}: {
  template: ChecklistTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(template?.name ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState(template?.category ?? '')
  const [items, setItems] = useState<string[]>(
    template?.items.map((i) => i.label) ?? [''],
  )
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const updateItem = (index: number, value: string) =>
    setItems((arr) => arr.map((v, i) => (i === index ? value : v)))

  const addItem = () => setItems((arr) => [...arr, ''])

  const removeItem = (index: number) =>
    setItems((arr) => arr.filter((_, i) => i !== index))

  const moveItem = (index: number, dir: -1 | 1) => {
    setItems((arr) => {
      const next = [...arr]
      const target = index + dir
      if (target < 0 || target >= next.length) return next
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const submit = async () => {
    setError('')
    if (!name.trim()) return setError('Template name is required')
    const cleaned = items.map((i) => i.trim()).filter((i) => i.length > 0)
    if (cleaned.length === 0)
      return setError('Add at least one checklist item')

    const payload: ChecklistInput = {
      name,
      description: description || undefined,
      category: category || undefined,
      items: cleaned.map((label) => ({ label })),
    }

    setSubmitting(true)
    try {
      if (template) {
        await checklistsApi.update(template.id, payload)
      } else {
        await checklistsApi.create(payload)
      }
      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save template')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal cl-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{template ? 'Edit Template' : 'New Template'}</h3>

        <label>Template Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <label>Category (optional)</label>
        <input
          value={category}
          placeholder="e.g. Perimeter, Interior, Fire Safety"
          onChange={(e) => setCategory(e.target.value)}
        />

        <label>Description (optional)</label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label>Checklist Items</label>
        <div className="cl-items">
          {items.map((item, i) => (
            <div key={i} className="cl-item-row">
              <div className="cl-item-move">
                <button onClick={() => moveItem(i, -1)} disabled={i === 0}>
                  ▲
                </button>
                <button
                  onClick={() => moveItem(i, 1)}
                  disabled={i === items.length - 1}
                >
                  ▼
                </button>
              </div>
              <input
                value={item}
                placeholder={`Item ${i + 1}`}
                onChange={(e) => updateItem(i, e.target.value)}
              />
              <button
                className="cl-item-remove"
                onClick={() => removeItem(i)}
                disabled={items.length === 1}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button className="cl-add-item" onClick={addItem}>
          + Add Item
        </button>

        {error && <div className="modal-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? 'Saving…' : template ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}