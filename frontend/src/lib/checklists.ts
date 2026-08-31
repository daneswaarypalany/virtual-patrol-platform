import { api } from './api'

export interface ChecklistItem {
  id: string
  label: string
  orderIndex: number
}

export interface ChecklistTemplate {
  id: string
  name: string
  description: string | null
  category: string | null
  items: ChecklistItem[]
  _count?: { checkpoints: number }
}

export interface ChecklistInput {
  name: string
  description?: string
  category?: string
  items: { label: string }[]
}

export const checklistsApi = {
  list: () => api.get<ChecklistTemplate[]>('/checklists').then((r) => r.data),
  create: (input: ChecklistInput) =>
    api.post<ChecklistTemplate>('/checklists', input).then((r) => r.data),
  update: (id: string, input: ChecklistInput) =>
    api.patch<ChecklistTemplate>(`/checklists/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/checklists/${id}`).then((r) => r.data),
}