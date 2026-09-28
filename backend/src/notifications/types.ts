import { CommunicationChannelType } from '@prisma/client';

// Extensible list of events that can trigger a site notification.
// Add new event types here as the platform grows real trigger points for them.
export type NotificationEventType =
  | 'INCIDENT_CREATED'
  | 'CRITICAL_INCIDENT'
  | 'HIGH_SEVERITY_INCIDENT'
  | 'PATROL_STARTED'
  | 'PATROL_COMPLETED'
  | 'PATROL_ISSUES_FLAGGED'
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

// Status a single provider.send() call can return. Kept in sync with the
// Prisma NotificationStatus enum (PENDING/SENT/FAILED/CONFIGURATION_REQUIRED)
// since dispatchOne() writes this directly to NotificationLog.status.
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

// A multi-recipient destination (e.g. several WhatsApp numbers standing in
// for a "group") can end up with a mix of outcomes across recipients — this
// is never written to NotificationLog.status directly, only used for the
// per-channel summary returned to the caller of sendToSite().
export type AggregateSendStatus = ProviderSendStatus | 'PARTIAL';

// Per-channel outcome of a sendToSite() call, e.g. { WHATSAPP: 'SENT', EMAIL: 'FAILED' }
export type DeliverySummary = Partial<
  Record<CommunicationChannelType, AggregateSendStatus>
>;