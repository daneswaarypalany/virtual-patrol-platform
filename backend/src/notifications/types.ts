import { CommunicationChannelType } from '@prisma/client';

// Extensible list of events that can trigger a site notification.
// Add new event types here as the platform grows real trigger points for them.
export type NotificationEventType =
  | 'INCIDENT_CREATED'
  | 'CRITICAL_INCIDENT'
  | 'HIGH_SEVERITY_INCIDENT'
  | 'PATROL_COMPLETED'
  | 'PATROL_CANCELLED'
  | 'SYSTEM_ALERT'
  | 'TEST';

export interface NotificationEvent {
  eventType: NotificationEventType;
  siteId: string;
  title: string;
  message: string;
  severity?: string;
  metadata?: Record<string, unknown>;
}

export type ProviderSendStatus = 'SENT' | 'FAILED' | 'CONFIGURATION_REQUIRED';

export interface ProviderSendResult {
  status: ProviderSendStatus;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface NotificationProvider {
  readonly channelType: CommunicationChannelType;
  send(destination: string, message: string): Promise<ProviderSendResult>;
}

// Per-channel outcome of a sendToSite() call, e.g. { WHATSAPP: 'SENT', EMAIL: 'FAILED' }
export type DeliverySummary = Partial<
  Record<CommunicationChannelType, ProviderSendStatus>
>;
