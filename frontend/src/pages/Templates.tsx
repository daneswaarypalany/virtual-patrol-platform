import { useEffect, useState } from 'react'
import { FileText, Plus, Pencil, Trash2, Star } from 'lucide-react'
import type { ReportTemplateSummary } from '../lib/report-template'
import { reportTemplateApi } from '../lib/report-template'
import ViewToggle, { type ViewMode } from '../components/ViewToggle'
import './Templates.css'

export default function Templates({
  onEdit,
}: {
  onEdit?: (id: string) => void
}) {
  const [templates, setTemplates] = useState<ReportTemplateSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [view, setView] = useState<ViewMode>('grid')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setTemplates(await reportTemplateApi.list())
    } catch {
      setError('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!newName.trim()) return
    try {
      await reportTemplateApi.create(newName.trim())
      setNewName('')
      setCreating(false)
      load()
    } catch {
      setError('Failed to create template')
    }
  }

  const rename = async (t: ReportTemplateSummary) => {
    const name = window.prompt('Rename template', t.name)
    if (!name || !name.trim() || name === t.name) return
    try {
      await reportTemplateApi.rename(t.id, name.trim())
      load()
    } catch {
      setError('Failed to rename template')
    }
  }

  const remove = async (t: ReportTemplateSummary) => {
    if (t.isDefault) return
    if (!window.confirm(`Delete template "${t.name}"? Sites using it will fall back to the default.`)) return
    try {
      await reportTemplateApi.remove(t.id)
      load()
    } catch {
      setError('Failed to delete template')
    }
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString() : '—'

  return (
    <div className="templates-page">
      <div className="templates-toolbar">
        <p className="templates-count">{templates.length} templates</p>
        <div className="templates-toolbar-right">
          <ViewToggle mode={view} onChange={setView} />
          {creating ? (
            <div className="templates-create">
              <input autoFocus placeholder="Template name…" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && create()} />
              <button className="btn-primary" onClick={create}>Create</button>
              <button className="btn-secondary" onClick={() => { setCreating(false); setNewName('') }}>Cancel</button>
            </div>
          ) : (
            <button className="btn-primary" onClick={() => setCreating(true)}>
              <Plus size={15} /> New Template
            </button>
          )}
        </div>
      </div>

      {error && <div className="templates-error">{error}</div>}

      {loading ? (
        <p className="templates-loading">Loading…</p>
      ) : view === 'grid' ? (
        <div className="templates-grid">
          {templates.map((t) => (
            <div key={t.id} className="template-card">
              <div className="template-card-icon"><FileText size={20} /></div>
              <div className="template-card-body">
                <div className="template-card-title">
                  <strong>{t.name}</strong>
                  {t.isDefault && <span className="template-default-badge"><Star size={11} /> Default</span>}
                </div>
                <span className="template-card-meta">Updated {fmt(t.updatedAt)}</span>
              </div>
              <div className="template-card-actions">
                {onEdit && <button onClick={() => onEdit(t.id)}><Pencil size={14} /> Edit</button>}
                <button onClick={() => rename(t)}>Rename</button>
                {!t.isDefault && <button className="danger" onClick={() => remove(t)}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="templates-list">
          {templates.map((t) => (
            <div key={t.id} className="template-row">
              <div className="template-row-icon"><FileText size={16} /></div>
              <div className="template-row-info">
                <strong>{t.name}</strong>
                {t.isDefault && <span className="template-default-badge"><Star size={11} /> Default</span>}
                <span className="template-card-meta">Updated {fmt(t.updatedAt)}</span>
              </div>
              <div className="template-card-actions">
                {onEdit && <button onClick={() => onEdit(t.id)}><Pencil size={14} /> Edit</button>}
                <button onClick={() => rename(t)}>Rename</button>
                {!t.isDefault && <button className="danger" onClick={() => remove(t)}><Trash2 size={14} /></button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}