import { useEffect, useState } from 'react'
import { Check, Search, Trash2, X } from 'lucide-react'
import type { Site, SiteInput } from '../lib/sites'
import { sitesApi } from '../lib/sites'
import SiteDetail from './SiteDetail'
import ViewToggle, { type ViewMode } from '../components/ViewToggle'
import './Sites.css'
import SearchableSelect from '../components/SearchableSelect'

type SortOption = 'custom' | 'alphabetical'

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Site | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [detailSite, setDetailSite] = useState<Site | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'all',
  )
  const [sortBy, setSortBy] = useState<SortOption>('custom')
  const [view, setView] = useState<ViewMode>('list')
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
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
    load()
  }, [])

  const openCreate = () => {
    setEditing(null)
    setShowForm(true)
  }

  const openEdit = (site: Site) => {
    setEditing(site)
    setShowForm(true)
  }

  const enterSelectMode = () => {
    setSelectMode(true)
    setSelected(new Set())
  }

  const cancelSelectMode = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const toggleSelected = (siteId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(siteId)) next.delete(siteId)
      else next.add(siteId)
      return next
    })
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (
      !window.confirm(
        `Delete ${selected.size} site${
          selected.size > 1 ? 's' : ''
        }? This also removes their cameras and assignments.`,
      )
    )
      return

    setDeleting(true)
    setError('')
    try {
      await Promise.all(Array.from(selected).map((id) => sitesApi.remove(id)))
      setSelectMode(false)
      setSelected(new Set())
      await load()
    } catch {
      setError('Failed to delete one or more sites')
    } finally {
      setDeleting(false)
    }
  }

  const filteredSites = sites.filter((site) => {
    const query = search.toLowerCase()

    const matchesSearch =
      site.name.toLowerCase().includes(query) ||
      (site.address ?? '').toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && site.isActive) ||
      (statusFilter === 'inactive' && !site.isActive)

    return matchesSearch && matchesStatus
  })

  const sortedSites = [...filteredSites].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return a.name.localeCompare(b.name)
    }

    return 0
  })

  return (
    <div className="sites-page">
      <div className="sites-toolbar">
        {selectMode ? (
          <>
            <div className="active-select-info">
              <label className="active-select-all">
                <input
                  type="checkbox"
                  checked={
                    sortedSites.length > 0 &&
                    sortedSites.every((s) => selected.has(s.id))
                  }
                  onChange={() =>
                    setSelected(
                      sortedSites.every((s) => selected.has(s.id))
                        ? new Set()
                        : new Set(sortedSites.map((s) => s.id)),
                    )
                  }
                />
                {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
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
            <div className="toolbar-left">
              <div className="search-box">
                <Search size={16} className="search-icon" />
                <input
                  placeholder="Search sites…"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              <div className="segmented">
                <button
                  className={statusFilter === 'all' ? 'active' : ''}
                  onClick={() => setStatusFilter('all')}
                >
                  All
                </button>

                <button
                  className={statusFilter === 'active' ? 'active' : ''}
                  onClick={() => setStatusFilter('active')}
                >
                  Active
                </button>

                <button
                  className={statusFilter === 'inactive' ? 'active' : ''}
                  onClick={() => setStatusFilter('inactive')}
                >
                  Inactive
                </button>
              </div>

              <div className="site-sort-w">
                <SearchableSelect
                  value={sortBy}
                  onChange={(v) => setSortBy(v as SortOption)}
                  searchable={false}
                  options={[
                    { value: 'custom', label: 'Custom order' },
                    { value: 'alphabetical', label: 'Alphabetical (A–Z)' },
                  ]}
                />
              </div>
            </div>

            <div className="toolbar-right">
              <ViewToggle mode={view} onChange={setView} />
              {sites.length > 0 && (
                <button className="active-delete-toggle" onClick={enterSelectMode}>
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <button className="btn-primary" onClick={openCreate}>
                + Add Site
              </button>
            </div>
          </>
        )}
      </div>

      <p className="sites-count">
        {filteredSites.length} of {sites.length} sites
      </p>

      {error && <div className="sites-error">{error}</div>}

      {loading ? (
        <p className="sites-loading">Loading…</p>
      ) : sites.length === 0 ? (
        <div className="sites-empty">
          <p>No sites yet. Add your first site to get started.</p>
        </div>
      ) : filteredSites.length === 0 ? (
        <div className="sites-empty">
          <p>No sites match your search or filter.</p>
        </div>
      ) : view === 'list' ? (
        <div className="sites-table-wrap">
          <table className="sites-table">
            <thead>
              <tr>
                {selectMode && <th className="active-select-col" />}
                <th>Name</th>
                <th>Address</th>
                <th>Timezone</th>
                <th>Cameras</th>
                <th>Operators</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedSites.map((site) => (
                <tr
                  key={site.id}
                  className={selected.has(site.id) ? 'row-selected' : ''}
                  onClick={() =>
                    selectMode ? toggleSelected(site.id) : setDetailSite(site)
                  }
                >
                  {selectMode && (
                    <td
                      className="active-select-col"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(site.id)}
                        onChange={() => toggleSelected(site.id)}
                        aria-label={`Select ${site.name}`}
                      />
                    </td>
                  )}
                  <td className="site-name">
                    <span className="site-link">{site.name}</span>
                  </td>

                  <td>{site.address || '—'}</td>
                  <td>{site.timezone}</td>
                  <td>{site._count.cameras}</td>
                  <td>{site._count.assignments}</td>

                  <td>
                    <span
                      className={`status-badge ${
                        site.isActive ? 'status-active' : 'status-inactive'
                      }`}
                    >
                      {site.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>

                  <td className="row-actions" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => openEdit(site)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sites-grid">
          {sortedSites.map((site) => (
            <div
              key={site.id}
              className={`site-card ${selected.has(site.id) ? 'card-selected' : ''}`}
              onClick={() =>
                selectMode ? toggleSelected(site.id) : setDetailSite(site)
              }
            >
              <div className="site-card-head">
                <div className="site-card-title">
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={selected.has(site.id)}
                      onChange={() => toggleSelected(site.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${site.name}`}
                    />
                  )}
                  <span className="site-link">{site.name}</span>
                </div>
                <span
                  className={`status-badge ${
                    site.isActive ? 'status-active' : 'status-inactive'
                  }`}
                >
                  {site.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>

              <p className="site-card-address">{site.address || 'No address'}</p>
              <p className="site-card-tz">{site.timezone}</p>

              <div className="site-card-stats">
                <span>{site._count.cameras} cameras</span>
                <span>{site._count.assignments} operators</span>
              </div>

              <div
                className="site-card-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <button onClick={() => openEdit(site)}>Edit</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <SiteModal
          site={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      {detailSite && (
        <SiteDetail
          site={detailSite}
          onClose={() => {
            setDetailSite(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function SiteModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site | null
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<SiteInput>({
    name: site?.name ?? '',
    address: site?.address ?? '',
    timezone: site?.timezone ?? 'Asia/Singapore',
    isActive: site?.isActive ?? true,
  })

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field: keyof SiteInput, value: string | boolean) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = async () => {
    setError('')

    if (!form.name.trim()) {
      setError('Site name is required')
      return
    }

    setSubmitting(true)

    try {
      if (site) {
        await sitesApi.update(site.id, form)
      } else {
        await sitesApi.create(form)
      }

      onSaved()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to save site')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>{site ? 'Edit Site' : 'Add Site'}</h3>

        <label>Site Name</label>
        <input
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          autoFocus
        />

        <label>Address</label>
        <input
          value={form.address}
          onChange={(event) => update('address', event.target.value)}
        />

        <label>Timezone</label>
        <input
          value={form.timezone}
          onChange={(event) => update('timezone', event.target.value)}
        />

        <div className="site-status-field">
          <div className="site-status-heading">
            <span>Site Status</span>
            <small>
              {form.isActive
                ? 'This site is available for patrol operations.'
                : 'This site is hidden from active operations.'}
            </small>
          </div>

          <div className="site-status-toggle">
            <button
              type="button"
              className={`site-status-option active-option ${
                form.isActive ? 'selected' : ''
              }`}
              onClick={() => update('isActive', true)}
              aria-pressed={form.isActive}
            >
              <span className="status-option-icon">
                <Check size={16} strokeWidth={3} />
              </span>

              <span>
                <strong>Active</strong>
                <small>Operational</small>
              </span>
            </button>

            <button
              type="button"
              className={`site-status-option inactive-option ${
                !form.isActive ? 'selected' : ''
              }`}
              onClick={() => update('isActive', false)}
              aria-pressed={!form.isActive}
            >
              <span className="status-option-icon">
                <X size={16} strokeWidth={3} />
              </span>

              <span>
                <strong>Inactive</strong>
                <small>Paused</small>
              </span>
            </button>
          </div>
        </div>

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
            {submitting ? 'Saving…' : site ? 'Save Changes' : 'Create Site'}
          </button>
        </div>
      </div>
    </div>
  )
}