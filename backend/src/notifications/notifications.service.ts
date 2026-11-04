import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommunicationChannelType } from '@prisma/client';
import { existsSync, statSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { TelegramProvider } from './providers/telegram.provider';
import { EmailProvider } from './providers/email.provider';
import {
  AggregateSendStatus,
  DeliverySummary,
  NotificationAttachment,
  NotificationEvent,
  NotificationProvider,
} from './types';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly providers: Record<CommunicationChannelType, NotificationProvider>;

  constructor(
    private prisma: PrismaService,
    whatsapp: WhatsAppProvider,
    telegram: TelegramProvider,
    email: EmailProvider,
  ) {
    this.providers = {
      [CommunicationChannelType.WHATSAPP]: whatsapp,
      [CommunicationChannelType.TELEGRAM]: telegram,
      [CommunicationChannelType.EMAIL]: email,
    };
  }

  // Resolve only the channels configured for this event's site. Provider
  // failures are isolated so one destination cannot stop other channels.
  async sendToSite(
    siteId: string,
    event: NotificationEvent,
  ): Promise<DeliverySummary> {
    const channels = await this.prisma.siteCommunicationChannel.findMany({
      where: { siteId, enabled: true },
    });

    const summary: DeliverySummary = {};
    const defaultMessage = `${event.title}\n\n${event.message}`;

    for (const channel of channels) {
      try {
        let message = defaultMessage;
        let attachment: NotificationAttachment | undefined;

        // Format patrol issue alerts using each channel's saved field selections.
        // Telegram can attach the screenshot; the current WhatsApp template provider
        // sends the selected details as text and does not attach image media.
        if (
          (channel.channelType === CommunicationChannelType.TELEGRAM ||
            channel.channelType === CommunicationChannelType.WHATSAPP) &&
          event.eventType === 'PATROL_ISSUES_FLAGGED'
        ) {
          const patrolPayload = await this.buildPatrolIssuePayload(
            event,
            channel,
            channel.channelType,
          );
          message = patrolPayload.message;
          attachment = patrolPayload.attachment;
        }

        const result = await this.dispatch(
          siteId,
          event.eventType,
          channel.channelType,
          channel.destination,
          message,
          attachment,
        );
        summary[channel.channelType] = result.status;
      } catch (error: unknown) {
        // A provider throwing must not abort other channels. Avoid logging
        // destination strings, bot tokens, message text, or image paths.
        this.logger.error(
          `Notification dispatch failed for site ${siteId} via ${channel.channelType}`,
          error instanceof Error ? error.stack : undefined,
        );
        summary[channel.channelType] = 'FAILED';
      }
    }

    return summary;
  }

  // Send a one-off test message through a configured channel, even if disabled.
  async sendTest(siteId: string, channelId: string) {
    const channel = await this.prisma.siteCommunicationChannel.findFirst({
      where: { id: channelId, siteId },
    });
    if (!channel) throw new NotFoundException('Communication channel not found');

    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    const message = `Virtual Patrol test notification for ${site?.name ?? 'this site'}.`;

    return this.dispatch(
      siteId,
      'TEST',
      channel.channelType,
      channel.destination,
      message,
    );
  }

  private async buildPatrolIssuePayload(
    event: NotificationEvent,
    fields: {
      includeDate: boolean;
      includeTime: boolean;
      includeSite: boolean;
      includePatrolRoute: boolean;
      includeComment: boolean;
      includeScreenshot: boolean;
    },
    channelType: CommunicationChannelType,
  ): Promise<{ message: string; attachment?: NotificationAttachment }> {
    const heading = '🚨 PATROL ISSUE FLAGGED';
    const jobId = typeof event.metadata?.jobId === 'string'
      ? event.metadata.jobId
      : '';
    const checkpointId = typeof event.metadata?.checkpointId === 'string'
      ? event.metadata.checkpointId
      : '';

    const unavailableLines: string[] = [];
    if (fields.includeDate) unavailableLines.push('Date: Not available');
    if (fields.includeTime) unavailableLines.push('Time: Not available');
    if (fields.includeSite) unavailableLines.push('Site: Not available');
    if (fields.includePatrolRoute) unavailableLines.push('Patrol Route: Not available');
    if (fields.includeComment) unavailableLines.push('Comment: Not available');
    if (fields.includeScreenshot) unavailableLines.push('Screenshot: Not available');

    const unavailablePayload = {
      message: [
        heading,
        '',
        ...unavailableLines,
        ...(unavailableLines.length ? ['', 'Open Virtual Patrol to review the patrol record.'] : [
          'Open Virtual Patrol to review the patrol record.',
        ]),
      ].join('\n'),
    };

    if (!jobId || !checkpointId) return unavailablePayload;

    const result = await this.prisma.checkpointResult.findUnique({
      where: {
        jobId_checkpointId: { jobId, checkpointId },
      },
      include: {
        job: {
          include: {
            route: {
              include: {
                site: { select: { name: true, timezone: true } },
              },
            },
          },
        },
      },
    });

    if (!result) return unavailablePayload;

    const site = result.job.route.site;
    const route = result.job.route;
    const occurredAt = result.completedAt;
    const timezone = site.timezone || 'Asia/Kuala_Lumpur';
    let dateText = 'Not available';
    let timeText = 'Not available';

    try {
      if (fields.includeDate) {
        dateText = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }).format(occurredAt);
      }
      if (fields.includeTime) {
        timeText = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).format(occurredAt);
      }
    } catch {
      if (fields.includeDate) dateText = occurredAt.toLocaleDateString();
      if (fields.includeTime) {
        timeText = occurredAt.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
    }

    let attachment: NotificationAttachment | undefined;
    const relativeScreenshot = (result.screenshotPath ?? '').replace(/\\/g, '/');
    const screenshotMatch = /^screenshots\/([A-Za-z0-9_.-]+\.(?:png|jpe?g|webp))$/i.exec(
      relativeScreenshot,
    );

    if (
      fields.includeScreenshot &&
      channelType === CommunicationChannelType.TELEGRAM &&
      screenshotMatch
    ) {
      const uploadsRoot = process.env.VERCEL
        ? join('/tmp', 'uploads')
        : join(process.cwd(), 'uploads');
      const root = resolve(uploadsRoot);
      const filePath = resolve(root, relativeScreenshot);

      // Keep all attachment paths confined to the configured uploads folder.
      if (
        filePath.startsWith(`${root}${sep}`) &&
        existsSync(filePath) &&
        statSync(filePath).isFile()
      ) {
        const extension = extname(filePath).toLowerCase();
        const contentType =
          extension === '.png'
            ? 'image/png'
            : extension === '.webp'
              ? 'image/webp'
              : 'image/jpeg';
        attachment = {
          filePath,
          fileName: basename(filePath),
          contentType,
        };
      }
    }

    const lines = [heading, ''];
    if (fields.includeDate) lines.push(`Date: ${dateText}`);
    if (fields.includeTime) lines.push(`Time: ${timeText}`);
    if (fields.includeSite) lines.push(`Site: ${site.name}`);
    if (fields.includePatrolRoute) lines.push(`Patrol Route: ${route.name}`);
    if (fields.includeComment) {
      lines.push(`Comment: ${result.comment?.trim() || 'Not provided'}`);
    }
    if (fields.includeScreenshot) {
      let screenshotLine: string;
      if (channelType === CommunicationChannelType.WHATSAPP) {
        screenshotLine = result.screenshotPath
          ? 'Saved in Virtual Patrol (not attached to this WhatsApp message)'
          : 'Not available';
      } else {
        screenshotLine = attachment
          ? 'Attached below'
          : result.screenshotPath
            ? 'Not attached (saved screenshot file is unavailable)'
            : 'Not available';
      }
      lines.push(`Screenshot: ${screenshotLine}`);
    }

    return { message: lines.join('\n'), attachment };
  }

  private async dispatch(
    siteId: string,
    eventType: string,
    channelType: CommunicationChannelType,
    destination: string,
    message: string,
    attachment?: NotificationAttachment,
  ): Promise<{ status: AggregateSendStatus }> {
    const provider = this.providers[channelType];
    const recipients = destination
      .split(',')
      .map((recipient) => recipient.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      return { status: 'FAILED' };
    }

    if (recipients.length === 1) {
      return this.dispatchOne(
        siteId,
        eventType,
        channelType,
        recipients[0],
        message,
        provider,
        attachment,
      );
    }

    const results = await Promise.all(
      recipients.map((recipient) =>
        this.dispatchOne(
          siteId,
          eventType,
          channelType,
          recipient,
          message,
          provider,
          attachment,
        ),
      ),
    );

    const statuses = new Set(results.map((result) => result.status));
    const aggregateStatus =
      statuses.size === 1
        ? results[0].status
        : statuses.has('SENT')
          ? 'PARTIAL'
          : 'FAILED';

    return { status: aggregateStatus };
  }

  private async dispatchOne(
    siteId: string,
    eventType: string,
    channelType: CommunicationChannelType,
    destination: string,
    message: string,
    provider: NotificationProvider,
    attachment?: NotificationAttachment,
  ) {
    const log = await this.prisma.notificationLog.create({
      data: {
        siteId,
        eventType,
        channelType,
        recipient: destination,
        message,
        status: 'PENDING',
      },
    });

    const result = await provider.send(destination, message, attachment);

    await this.prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: result.status,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
        sentAt: result.status === 'SENT' ? new Date() : null,
      },
    });

    if (result.status !== 'SENT') {
      this.logger.warn(
        `Notification delivery failed for site ${siteId} via ${channelType}: ${result.errorMessage ?? result.status}`,
      );
    }

    return result;
  }
}
