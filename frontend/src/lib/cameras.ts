import { api } from './api'

export interface Camera {
  id: string
  name: string
  cameraCode: string
  location: string | null
  streamUrl: string | null
  status: string
  siteId: string
  site?: { id: string; name: string }
  _count?: { checkpoints: number }
}

export interface CameraInput {
  name: string
  cameraCode: string
  siteId: string
  location?: string
  streamUrl?: string
}

export const camerasApi = {
  list: (siteId?: string) =>
    api
      .get<Camera[]>('/cameras', { params: siteId ? { siteId } : {} })
      .then((r) => r.data),
  create: (input: CameraInput) =>
    api.post<Camera>('/cameras', input).then((r) => r.data),
  update: (id: string, input: Partial<CameraInput>) =>
    api.patch<Camera>(`/cameras/${id}`, input).then((r) => r.data),
  remove: (id: string) => api.delete(`/cameras/${id}`).then((r) => r.data),
  // Resolves whatever the camera's streamUrl is (an rtsp:// link, or an
  // existing http(s) HLS url) into a URL a <video>/hls.js can actually play.
  // rtsp:// links get transcoded to HLS on the backend on demand.
  getStreamUrl: (id: string) =>
    api
      .get<{ url: string; mode: 'proxy' | 'direct' }>(`/cameras/${id}/stream`)
      .then((r) => r.data),
}