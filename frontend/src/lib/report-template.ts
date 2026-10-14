import { api } from './api'

export interface ReportFieldItem {
  key: string
  label: string
}

export interface ReportField {
  key: string
  label: string
  description: string
  group: 'summary' | 'checkpoint'
  enabled: boolean
  height?: number
  width?: number
  row?: number
  /** Item-level visibility preferences saved with the template. */
  options?: Record<string, boolean>
  /** Configurable items supplied by the backend component definition. */
  items: ReportFieldItem[]
}

export interface ReportTemplateSummary {
  id: string
  key: string
  name: string
  isDefault: boolean
  updatedAt: string | null
}

export interface ReportTemplate {
  id: string
  key: string
  name: string
  isDefault: boolean
  fields: ReportField[]
  updatedAt: string | null
}

type SaveField = {
  key: string
  enabled: boolean
  height?: number
  width?: number
  row?: number
  options?: Record<string, boolean>
}

export const reportTemplateApi = {
  // list all templates
  list: () =>
    api.get<ReportTemplateSummary[]>('/report-template/list').then((r) => r.data),

  // get one template's full layout (default if no id)
  get: (id?: string) =>
    api
      .get<ReportTemplate>('/report-template', { params: id ? { id } : {} })
      .then((r) => r.data),

  getById: (id: string) =>
    api.get<ReportTemplate>(`/report-template/${id}`).then((r) => r.data),

  // create a new named template (from defaults)
  create: (name: string) =>
    api
      .post<ReportTemplate>('/report-template', { name })
      .then((r) => r.data),

  rename: (id: string, name: string) =>
    api
      .patch<ReportTemplate>(`/report-template/${id}/name`, { name })
      .then((r) => r.data),

  // save a template's fields by id, including per-component item visibility
  updateById: (id: string, fields: SaveField[]) =>
    api
      .put<ReportTemplate>(`/report-template/${id}`, { fields })
      .then((r) => r.data),

  // save the default template (backward compat)
  update: (fields: SaveField[]) =>
    api.put<ReportTemplate>('/report-template', { fields }).then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/report-template/${id}`).then((r) => r.data),
}
