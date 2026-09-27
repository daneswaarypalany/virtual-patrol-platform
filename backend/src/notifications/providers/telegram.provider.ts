import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannelType } from '@prisma/client';
import { NotificationProvider, ProviderSendResult } from '../types';

// Sends via the official Telegram Bot API. Requires TELEGRAM_BOT_TOKEN
// server-side. Destination is the site's configured chat/channel ID.
@Injectable()
export class TelegramProvider implements NotificationProvider {
  readonly channelType = CommunicationChannelType.TELEGRAM;

  constructor(private config: ConfigService) {}

  async send(destination: string, message: string): Promise<ProviderSendResult> {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      return { status: 'CONFIGURATION_REQUIRED' };
    }

    if (!destination?.trim()) {
      return { status: 'FAILED', errorMessage: 'Missing Telegram chat ID' };
    }

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: destination,
            text: message,
          }),
        },
      );

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok || !data?.ok) {
        return {
          status: 'FAILED',
          errorMessage: data?.description || `Telegram API responded with ${res.status}`,
        };
      }

      return {
        status: 'SENT',
        providerMessageId: data?.result?.message_id
          ? String(data.result.message_id)
          : undefined,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        errorMessage: err?.message || 'Telegram request failed',
      };
    }
  }
}
