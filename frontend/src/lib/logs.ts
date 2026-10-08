import { api } from './api'

export interface ActiveUser {
  id: string
  username: string
  fullName: string
  role: 'ADMIN' | 'OPERATOR' | 'VIEWER'
  lastLoginAt: string | null
  lastActiveAt: string | null
  online: boolean
}

export interface ActivityLogEntry {
  id: string
  action: string
  entity: string
  entityId: string | null
  details: string | null
  userId: string | null
  createdAt: string
  user: {
    id: string
    username: string
    fullName: string
    role: string
  } | null
}

export interface ActivityLogPage {
  items: ActivityLogEntry[]
  total: number
  page: number
  pageSize: number
}

export interface ActivityFilters {
  page?: number
  pageSize?: number
  action?: string
  userId?: string
  search?: string
  from?: string
  to?: string
}

export const logsApi = {
  activeUsers: () => api.get<ActiveUser[]>('/logs/active-users').then((r) => r.data),

  actions: () => api.get<string[]>('/logs/actions').then((r) => r.data),

  list: (filters: ActivityFilters = {}) =>
    api
      .get<ActivityLogPage>('/logs', { params: filters })
      .then((r) => r.data),
}