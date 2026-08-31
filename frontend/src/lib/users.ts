import { api } from './api'
import type { Role } from '../auth/AuthContext'

export type UserStatus = 'ACTIVE' | 'INACTIVE'

export interface AppUser {
  id: string
  username: string
  email: string
  fullName: string
  role: Role
  status: UserStatus
  createdAt: string
}

export interface AssignedSite {
  id: string
  name: string
  address: string | null
  timezone: string
  isActive: boolean
}

export interface CreateUserInput {
  username: string
  email: string
  password: string
  fullName: string
  role: 'OPERATOR' | 'VIEWER'
}

export const usersApi = {
  list: () => api.get<AppUser[]>('/users').then((r) => r.data),

  assignedSites: (id: string) =>
  api.get<AssignedSite[]>(`/users/${id}/sites`).then((r) => r.data),

  create: (input: CreateUserInput) =>
    api.post<AppUser>('/users', input).then((r) => r.data),

  deactivate: (id: string) =>
    api.patch<AppUser>(`/users/${id}/deactivate`).then((r) => r.data),

  reactivate: (id: string) =>
    api.patch<AppUser>(`/users/${id}/reactivate`).then((r) => r.data),

  resetPassword: (id: string, newPassword: string) =>
    api.patch(`/users/${id}/reset-password`, { newPassword }).then((r) => r.data),
}