import { CommunicationChannelType } from '@prisma/client';

// Extensible list of events that can trigger a site notification.
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

/** An optional server-side file to attach to a provider notification. */
export interface NotificationAttachment {
  filePath: string;
  fileName: string;
  contentType: string;
}

// Status a single provider.send() call can return. Kept in sync with the
// Prisma NotificationStatus enum (PENDING/SENT/FAILED/CONFIGURATION_REQUIRED).
export type ProviderSendStatus = 'SENT' | 'FAILED' | 'CONFIGURATION_REQUIRED';

export interface ProviderSendResult {
  status: ProviderSendStatus;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface NotificationProvider {
  readonly channelType: CommunicationChannelType;
  send(
    destination: string,
    message: string,
    attachment?: NotificationAttachment,
  ): Promise<ProviderSendResult>;
}

// A multi-recipient destination can produce mixed delivery outcomes.
export type AggregateSendStatus = ProviderSendStatus | 'PARTIAL';

export type DeliverySummary = Partial<
  Record<CommunicationChannelType, AggregateSendStatus>
>;
