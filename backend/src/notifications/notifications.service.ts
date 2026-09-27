import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CommunicationChannelType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { TelegramProvider } from './providers/telegram.provider';
import { EmailProvider } from './providers/email.provider';
import {
  DeliverySummary,
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

  // Resolves ONLY the channels configured for this event's own site, then
  // attempts delivery through each enabled provider independently — one
  // provider failing must never stop the others from being attempted.
  async sendToSite(siteId: string, event: NotificationEvent): Promise<DeliverySummary> {
    const channels = await this.prisma.siteCommunicationChannel.findMany({
      where: { siteId, enabled: true },
    });

    const summary: DeliverySummary = {};
    const message = `${event.title}\n\n${event.message}`;

    for (const channel of channels) {
      try {
        const result = await this.dispatch(
          siteId,
          event.eventType,
          channel.channelType,
          channel.destination,
          message,
        );
        summary[channel.channelType] = result.status;
      } catch (err) {
        // A single provider throwing must not abort the remaining channels.
        this.logger.error(
          `Notification dispatch failed for site ${siteId} via ${channel.channelType}`,
          err as Error,
        );
        summary[channel.channelType] = 'FAILED';
      }
    }

    return summary;
  }

  // Sends a one-off test message through a single configured channel,
  // regardless of whether it's currently marked enabled.
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

  private async dispatch(
    siteId: string,
    eventType: string,
    channelType: CommunicationChannelType,
    destination: string,
    message: string,
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

    const provider = this.providers[channelType];
    const result = await provider.send(destination, message);

    await this.prisma.notificationLog.update({
      where: { id: log.id },
      data: {
        status: result.status,
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
        sentAt: result.status === 'SENT' ? new Date() : null,
      },
    });

    return result;
  }
}
