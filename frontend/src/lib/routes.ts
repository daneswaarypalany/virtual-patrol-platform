import { api } from './api'

export interface CheckpointInput {
  cameraId: string
  checklistTemplateId: string
}

export interface RouteCheckpoint {
  id: string
  orderIndex: number
  cameraId: string
  checklistTemplateId: string
  camera: { id: string; name: string; location: string | null }
  checklistTemplate: { id: string; name: string }
}

export interface Route {
  id: string
  name: string
  description: string | null
  estimatedMinutes: number | null
  siteId: string
  site: { id: string; name: string }
  checkpoints: RouteCheckpoint[]
  _count: { checkpoints: number }
}

export interface RouteInput {
  name: string
  siteId: string
  description?: string
  estimatedMinutes?: number
  checkpoints: CheckpointInput[]
}

export const routesApi = {
  list: (siteId?: string) =>
    api
      .get<Route[]>('/routes', { params: siteId ? { siteId } : {} })
      .then((r) => r.data),
  getOne: (id: string) => api.get<Route>(`/routes/${id}`).then((r) => r.data),
  create: (input: RouteInput) =>
    api.post<Route>('/routes', input).then((r) => r.data),
  update: (id: string, input: Partial<RouteInput>) =>
    api.patch<Route>(`/routes/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/routes/${id}`).then((r) => r.data),
}