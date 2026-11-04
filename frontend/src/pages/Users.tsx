import { useEffect, useState } from 'react'
import { Search, X, Trash2 } from 'lucide-react'
import type { AppUser, AssignedSite, CreateUserInput } from '../lib/users'
import { usersApi } from '../lib/users'
import './Users.css'
import SearchableSelect from '../components/SearchableSelect'
import { useAppDialog } from '../components/AppDialogProvider'

type StatusFilter = 'all' | 'active' | 'inactive'
type SortOption = 'custom' | 'alphabetical'
type RoleFilter = 'all' | 'admin' | 'operator' | 'viewer'

export default function Users() {
  const { confirm, prompt, alert: showAlert } = useAppDialog()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('custom')
  const [isDeleteMode, setIsDeleteMode] = useState(false)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])

  const load = async () => {
    setLoading(true)
    setError('')

    try {
      setUsers(await usersApi.list())
    } catch {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const toggleStatus = async (user: AppUser) => {
    try {
      if (user.status === 'ACTIVE') {
        await usersApi.deactivate(user.id)
      } else {
        await usersApi.reactivate(user.id)
      }

      load()
    } catch {
      setError('Failed to update user status')
    }
  }


  const resetPassword = async (user: AppUser) => {
    const newPassword = await prompt({
      title: 'Reset user password',
      message: `Set a new password for ${user.username}. The password must contain at least 6 characters.`,
      inputLabel: 'New password',
      inputType: 'password',
      placeholder: 'Enter new password',
      confirmLabel: 'Reset password',
    })

    if (!newPassword) return

    if (newPassword.length < 6) {
      await showAlert({ title: 'Password too short', message: 'Password must be at least 6 characters.', tone: 'warning' })
      return
    }

    try {
      await usersApi.resetPassword(user.id, newPassword)
      await showAlert({ title: 'Password reset', message: `The password for ${user.username} was reset successfully.`, tone: 'success' })
    } catch {
      await showAlert({ title: 'Password reset failed', message: 'The password could not be reset. Please try again.', tone: 'danger' })
    }
  }

  const filteredUsers = users.filter((user) => {
    const query = search.toLowerCase()

    const matchesSearch =
      user.fullName.toLowerCase().includes(query) ||
      user.username.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      user.role.toLowerCase().includes(query)

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.status === 'ACTIVE') ||
      (statusFilter === 'inactive' && user.status === 'INACTIVE')

    const matchesRole =
      roleFilter === 'all' || user.role.toLowerCase() === roleFilter

    return matchesSearch && matchesStatus && matchesRole
  })

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (sortBy === 'alphabetical') {
      return a.fullName.localeCompare(b.fullName)
    }

    return 0
  })

  const selectableVisibleUsers = sortedUsers.filter((user) => user.role !== 'ADMIN')
  const selectedDeletableUsers = users.filter(
    (user) => selectedUserIds.includes(user.id) && user.role !== 'ADMIN',
  )
  const allVisibleUsersSelected =
    selectableVisibleUsers.length > 0 &&
    selectableVisibleUsers.every((user) => selectedUserIds.includes(user.id))

  const toggleDeleteMode = () => {
    setIsDeleteMode((current) => !current)
    setSelectedUserIds([])
  }

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    )
  }

  const toggleVisibleUserSelection = () => {
    const visibleIds = selectableVisibleUsers.map((user) => user.id)
    setSelectedUserIds((current) => {
      if (visibleIds.length > 0 && visibleIds.every((id) => current.includes(id))) {
        return current.filter((id) => !visibleIds.includes(id))
      }

      return Array.from(new Set([...current, ...visibleIds]))
    })
  }

  const deleteSelectedUsers = async () => {
    const targets = selectedDeletableUsers
    if (targets.length === 0) return

    const accepted = await confirm({
      title: `Delete ${targets.length} selected user${targets.length === 1 ? '' : 's'}?`,
      message: `You are about to permanently delete ${targets.length} user account${targets.length === 1 ? '' : 's'}. Their site assignments will be removed. Accounts linked to patrol history cannot be permanently deleted; those accounts will remain and should be deactivated instead. This action cannot be undone for accounts that are deleted.`,
      tone: 'danger',
      confirmLabel: `Delete ${targets.length} user${targets.length === 1 ? '' : 's'}`,
      cancelLabel: 'Cancel',
    })

    if (!accepted) return

    const results = await Promise.all(
      targets.map(async (user) => {
        try {
          await usersApi.remove(user.id)
          return { user, success: true as const, message: '' }
        } catch (err: any) {
          const responseMessage = err?.response?.data?.message
          const message = Array.isArray(responseMessage)
            ? responseMessage.join(' ')
            : responseMessage || 'Deletion failed.'
          return { user, success: false as const, message }
        }
      }),
    )

    const successfulIds = results.filter((result) => result.success).map((result) => result.user.id)
    const failures = results.filter((result) => !result.success)

    if (successfulIds.length > 0) {
      setUsers((current) => current.filter((user) => !successfulIds.includes(user.id)))
    }

    setSelectedUserIds([])
    setIsDeleteMode(false)

    if (failures.length === 0) {
      await showAlert({
        title: 'Users deleted',
        message: `${successfulIds.length} user${successfulIds.length === 1 ? '' : 's'} deleted successfully.`,
        tone: 'success',
        confirmLabel: 'Done',
      })
      return
    }

    const failureSummary = failures
      .map((result) => `${result.user.fullName}: ${result.message}`)
      .join('\n')
    const successSummary = successfulIds.length
      ? `${successfulIds.length} user${successfulIds.length === 1 ? '' : 's'} deleted successfully. `
      : ''

    await showAlert({
      title: successfulIds.length ? 'Some users could not be deleted' : 'Unable to delete selected users',
      message: `${successSummary}${failures.length} account${failures.length === 1 ? '' : 's'} could not be deleted:\n${failureSummary}`,
      tone: 'warning',
      confirmLabel: 'Understood',
    })
  }

  return (
    <div className="users-page">
      <div className="users-toolbar">
        <div className="toolbar-left">
          <div className="search-box">
            <Search size={16} className="search-icon" />
            <input
              placeholder="Search name, username, email or role…"
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

          <div className="user-filter-wrap">
            <SearchableSelect
            value={roleFilter}
            onChange={(value) => setRoleFilter(value as RoleFilter)}
            ariaLabel="Filter users by role"
            searchable={false}
            options={[
              { value: 'all', label: 'All roles' },
              { value: 'admin', label: 'Administrators' },
              { value: 'operator', label: 'Operators' },
              { value: 'viewer', label: 'Viewers' },
            ]}
            />
          </div>

          <div className="user-filter-wrap">
            <SearchableSelect
            value={sortBy}
            onChange={(value) => setSortBy(value as SortOption)}
            ariaLabel="Sort users"
            searchable={false}
            options={[
              { value: 'custom', label: 'Custom order' },
              { value: 'alphabetical', label: 'Alphabetical (A–Z)' },
            ]}
            />
          </div>
        </div>

        <div className="users-toolbar-actions">
          {isDeleteMode ? (
            <>
              <span className="users-selection-summary">
                {selectedDeletableUsers.length} selected
              </span>
              <button type="button" className="btn-secondary" onClick={toggleDeleteMode}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={deleteSelectedUsers}
                disabled={selectedDeletableUsers.length === 0}
              >
                <Trash2 size={15} />
                Delete selected
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-danger-outline" onClick={toggleDeleteMode}>
                <Trash2 size={15} />
                Delete
              </button>
              <button className="btn-primary" onClick={() => setShowForm(true)}>
                + Create User
              </button>
            </>
          )}
        </div>
      </div>

      <p className="users-count">
        {filteredUsers.length} of {users.length} users
      </p>

      {error && <div className="users-error">{error}</div>}

      {loading ? (
        <p className="users-loading">Loading…</p>
      ) : users.length === 0 ? (
        <div className="users-empty">
          <p>No users have been created yet.</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="users-empty">
          <p>No users match your search or filter.</p>
        </div>
      ) : (
        <div className="users-table-wrap">
          <table className="users-table">
            <thead>
              <tr>
                {isDeleteMode && (
                  <th className="user-select-cell">
                    <input
                      type="checkbox"
                      className="user-select-checkbox"
                      checked={allVisibleUsersSelected}
                      onChange={toggleVisibleUserSelection}
                      disabled={selectableVisibleUsers.length === 0}
                      aria-label="Select all visible non-admin users"
                    />
                  </th>
                )}
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {sortedUsers.map((user) => (
                <tr
                  key={user.id}
                  className={isDeleteMode && selectedUserIds.includes(user.id) ? 'is-selected-for-delete' : ''}
                >
                  {isDeleteMode && (
                    <td className="user-select-cell">
                      <input
                        type="checkbox"
                        className="user-select-checkbox"
                        checked={user.role !== 'ADMIN' && selectedUserIds.includes(user.id)}
                        disabled={user.role === 'ADMIN'}
                        onChange={() => toggleUserSelection(user.id)}
                        aria-label={user.role === 'ADMIN' ? 'Administrator accounts cannot be deleted' : `Select ${user.fullName}`}
                        title={user.role === 'ADMIN' ? 'Administrator accounts cannot be deleted' : `Select ${user.fullName}`}
                      />
                    </td>
                  )}
                  <td>{user.fullName}</td>
                  <td>{user.username}</td>
                  <td>{user.email}</td>

                  <td>
                    {user.role === 'ADMIN' ? (
                      <span className="role-badge role-admin">ADMIN</span>
                    ) : (
                      <button
                        type="button"
                        className={`role-badge role-badge-button role-${user.role.toLowerCase()}`}
                        onClick={() => setSelectedUser(user)}
                        title={`View sites assigned to ${user.fullName}`}
                      >
                        {user.role}
                      </button>
                    )}
                  </td>

                  <td>
                    <span
                      className={`status-badge status-${user.status.toLowerCase()}`}
                    >
                      {user.status}
                    </span>
                  </td>

                  <td className="row-actions">
                    <button onClick={() => resetPassword(user)}>
                      Reset PW
                    </button>

                    {user.role !== 'ADMIN' && (
                      <>
                        <button onClick={() => toggleStatus(user)}>
                          {user.status === 'ACTIVE'
                            ? 'Deactivate'
                            : 'Reactivate'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <CreateUserModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false)
            load()
          }}
        />
      )}

      {selectedUser && (
        <AssignedSitesModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  )
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: () => void
}) {
  const [form, setForm] = useState<CreateUserInput>({
    username: '',
    email: '',
    password: '',
    fullName: '',
    role: 'OPERATOR',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const update = (field: keyof CreateUserInput, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = async () => {
    setError('')

    if (!form.username || !form.email || !form.password || !form.fullName) {
      setError('All fields are required')
      return
    }

    if (form.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setSubmitting(true)

    try {
      await usersApi.create(form)
      onCreated()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <h3>Create User</h3>

        <label>Full Name</label>
        <input
          value={form.fullName}
          onChange={(event) => update('fullName', event.target.value)}
        />

        <label>Username</label>
        <input
          value={form.username}
          onChange={(event) => update('username', event.target.value)}
        />

        <label>Email</label>
        <input
          type="email"
          value={form.email}
          onChange={(event) => update('email', event.target.value)}
        />

        <label>Password</label>
        <input
          type="password"
          value={form.password}
          onChange={(event) => update('password', event.target.value)}
        />

        <label>Role</label>
        <SearchableSelect
          className="user-form-role-select"
          ariaLabel="Role"
          value={form.role}
          onChange={(value) => update('role', value)}
          searchable={false}
          portal
          options={[
            { value: 'OPERATOR', label: 'Operator' },
            { value: 'VIEWER', label: 'Viewer' },
          ]}
        />

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
            {submitting ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignedSitesModal({
  user,
  onClose,
}: {
  user: AppUser
  onClose: () => void
}) {
  const [sites, setSites] = useState<AssignedSite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadAssignedSites = async () => {
      try {
        setSites(await usersApi.assignedSites(user.id))
      } catch {
        setError('Failed to load assigned sites')
      } finally {
        setLoading(false)
      }
    }

    loadAssignedSites()
  }, [user.id])

  return (
    <div className="assignment-backdrop" onClick={onClose}>
      <div
        className="assignment-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="assignment-head">
          <div>
            <span className="assignment-eyebrow">Assigned locations</span>
            <h3>{user.fullName}</h3>
            <p>
              {user.username} · {user.role.toLowerCase()}
            </p>
          </div>

          <button
            type="button"
            className="assignment-close"
            onClick={onClose}
            aria-label="Close assigned sites"
          >
            <X size={18} />
          </button>
        </div>

        <div className="assignment-body">
          {loading ? (
            <p className="assignment-muted">Loading assigned sites…</p>
          ) : error ? (
            <p className="assignment-error">{error}</p>
          ) : sites.length === 0 ? (
            <div className="assignment-empty">
              <strong>No sites assigned</strong>
              <p>
                Assign this {user.role.toLowerCase()} from Site Management.
              </p>
            </div>
          ) : (
            <>
              <p className="assignment-count">
                {sites.length} assigned site{sites.length === 1 ? '' : 's'}
              </p>

              <div className="assignment-list">
                {sites.map((site) => (
                  <div className="assignment-site" key={site.id}>
                    <div className="assignment-site-icon">
                      {site.name.charAt(0).toUpperCase()}
                    </div>

                    <div className="assignment-site-info">
                      <strong>{site.name}</strong>
                      <span>{site.address || 'No address provided'}</span>
                      <small>{site.timezone}</small>
                    </div>

                    <span
                      className={`status-badge ${
                        site.isActive ? 'status-active' : 'status-inactive'
                      }`}
                    >
                      {site.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}