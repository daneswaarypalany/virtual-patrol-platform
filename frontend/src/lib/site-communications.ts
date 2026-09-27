import { api } from './api'

export type ChannelType = 'WHATSAPP' | 'TELEGRAM' | 'EMAIL'

export interface SiteCommunicationChannel {
  id: string
  siteId: string
  channelType: ChannelType
  enabled: boolean
  destination: string
  displayName: string | null
  createdAt: string
  updatedAt: string
}

export interface CommunicationChannelInput {
  channelType: ChannelType
  destination: string
  displayName?: string
  enabled?: boolean
}

export interface CommunicationChannelUpdate {
  destination?: string
  displayName?: string
  enabled?: boolean
}

export type TestStatus = 'SENT' | 'FAILED' | 'CONFIGURATION_REQUIRED'

export interface TestResult {
  status: TestStatus
  providerMessageId?: string
  errorMessage?: string
}

export const siteCommunicationsApi = {
  list: (siteId: string) =>
    api
      .get<SiteCommunicationChannel[]>(`/sites/${siteId}/communications`)
      .then((r) => r.data),
  create: (siteId: string, input: CommunicationChannelInput) =>
    api
      .post<SiteCommunicationChannel>(`/sites/${siteId}/communications`, input)
      .then((r) => r.data),
  update: (siteId: string, channelId: string, input: CommunicationChannelUpdate) =>
    api
      .patch<SiteCommunicationChannel>(
        `/sites/${siteId}/communications/${channelId}`,
        input,
      )
      .then((r) => r.data),
  remove: (siteId: string, channelId: string) =>
    api.delete(`/sites/${siteId}/communications/${channelId}`).then((r) => r.data),
  test: (siteId: string, channelId: string) =>
    api
      .post<TestResult>(`/sites/${siteId}/communications/${channelId}/test`)
      .then((r) => r.data),
}
