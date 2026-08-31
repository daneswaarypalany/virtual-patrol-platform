import { api } from './api'
import type { Role } from '../auth/AuthContext'

export interface Site {
  id: string
  name: string
  address: string | null
  timezone: string
  isActive: boolean
  createdAt: string
  _count: { cameras: number; assignments: number }
}

export interface SiteInput {
  name: string
  address?: string
  timezone?: string
  isActive?: boolean
}

export interface AssignedUser {
  id: string
  username: string
  fullName: string
  role: Role
  status: string
}

export const sitesApi = {
  list: () => api.get<Site[]>('/sites').then((r) => r.data),
  getOne: (id: string) => api.get<Site>(`/sites/${id}`).then((r) => r.data),
  create: (input: SiteInput) => api.post<Site>('/sites', input).then((r) => r.data),
  update: (id: string, input: SiteInput) =>
    api.patch<Site>(`/sites/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/sites/${id}`).then((r) => r.data),
  getAssignments: (siteId: string) =>
    api.get<AssignedUser[]>(`/sites/${siteId}/assignments`).then((r) => r.data),
  assignUser: (siteId: string, userId: string) =>
    api.post(`/sites/${siteId}/assignments/${userId}`).then((r) => r.data),
  unassignUser: (siteId: string, userId: string) =>
    api.delete(`/sites/${siteId}/assignments/${userId}`).then((r) => r.data),
}