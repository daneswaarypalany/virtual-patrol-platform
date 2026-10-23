import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannelType } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import {
  NotificationAttachment,
  NotificationProvider,
  ProviderSendResult,
} from '../types';

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  result?: { message_id?: number };
}

// Sends through the official Telegram Bot API. The token stays server-side.
// Destinations must be a numeric chat ID or a public @channel username.
@Injectable()
export class TelegramProvider implements NotificationProvider {
  readonly channelType = CommunicationChannelType.TELEGRAM;

  constructor(private config: ConfigService) {}

  async send(
    destination: string,
    message: string,
    attachment?: NotificationAttachment,
  ): Promise<ProviderSendResult> {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      return {
        status: 'CONFIGURATION_REQUIRED',
        errorMessage: 'Telegram is not configured: set TELEGRAM_BOT_TOKEN on the backend.',
      };
    }

    const chatId = (destination ?? '').trim();
    if (!chatId) {
      return { status: 'FAILED', errorMessage: 'Missing Telegram chat ID.' };
    }

    // Avoid passing common configuration mistakes (t.me links, bot usernames,
    // pasted labels) to Telegram as if they were valid chat identifiers.
    const isNumericChatId = /^-?\d+$/.test(chatId);
    const isPublicUsername = /^@[A-Za-z0-9_]{5,}$/.test(chatId);
    if (!isNumericChatId && !isPublicUsername) {
      return {
        status: 'FAILED',
        errorMessage:
          'Invalid Telegram destination. Use the numeric chat ID (groups/supergroups are often negative, commonly -100…) or a public channel username such as @yourchannel. Do not paste a t.me link or the bot username.',
      };
    }

    if (!attachment) {
      return this.sendText(botToken, chatId, message);
    }

    let file: Uint8Array;
    try {
      const buffer = await readFile(attachment.filePath);
      file = new Uint8Array(buffer);
    } catch {
      // Still deliver the incident details when the image cannot be read.
      const fallbackMessage = message.replace(
        /Screenshot: Attached below/i,
        'Screenshot: Not attached (file unavailable on the notification server).',
      );
      const result = await this.sendText(botToken, chatId, fallbackMessage);
      return result.status === 'SENT'
        ? {
            ...result,
            errorMessage: 'Text notification sent, but the screenshot file could not be read.',
          }
        : result;
    }

    // Telegram photo captions are limited to 1024 characters. Typical incident
    // notices fit in one photo caption; for a long operator comment, send the
    // full text first and the image as a second message rather than truncating it.
    if (message.length > 1024) {
      const textResult = await this.sendText(botToken, chatId, message);
      if (textResult.status !== 'SENT') return textResult;

      const photoResult = await this.sendPhoto(
        botToken,
        chatId,
        'Screenshot evidence for the patrol issue.',
        attachment,
        file,
      );

      if (photoResult.status !== 'SENT') {
        return {
          status: 'FAILED',
          providerMessageId: textResult.providerMessageId,
          errorMessage: `The incident details were sent, but the screenshot failed to upload. ${photoResult.errorMessage ?? ''}`.trim(),
        };
      }
      return photoResult;
    }

    return this.sendPhoto(botToken, chatId, message, attachment, file);
  }

  private async sendText(
    botToken: string,
    chatId: string,
    message: string,
  ): Promise<ProviderSendResult> {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            // Plain text deliberately avoids Telegram Markdown/HTML injection
            // from operator comments or other user-entered fields.
          }),
        },
      );
      const data = (await response.json().catch(() => ({}))) as TelegramApiResponse;
      return this.toSendResult(response.ok && data.ok === true, data, response.status);
    } catch (error: unknown) {
      return {
        status: 'FAILED',
        errorMessage:
          error instanceof Error ? error.message : 'Telegram request failed.',
      };
    }
  }

  private async sendPhoto(
    botToken: string,
    chatId: string,
    caption: string,
    attachment: NotificationAttachment,
    bytes: Uint8Array,
  ): Promise<ProviderSendResult> {
    try {
      const form = new FormData();
      form.set('chat_id', chatId);
      form.set('caption', caption);
      form.set(
        'photo',
        (() => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  return new Blob([buffer], {
    type: attachment.contentType,
  });
})(),
        attachment.fileName,
      );

      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        {
          method: 'POST',
          // Do not set Content-Type manually; fetch supplies the multipart boundary.
          body: form,
        },
      );
      const data = (await response.json().catch(() => ({}))) as TelegramApiResponse;
      return this.toSendResult(response.ok && data.ok === true, data, response.status);
    } catch (error: unknown) {
      return {
        status: 'FAILED',
        errorMessage:
          error instanceof Error ? error.message : 'Telegram photo upload failed.',
      };
    }
  }

  private toSendResult(
    ok: boolean,
    data: TelegramApiResponse,
    httpStatus: number,
  ): ProviderSendResult {
    if (!ok) {
      const description = data?.description ?? `Telegram API responded with HTTP ${httpStatus}.`;
      return {
        status: 'FAILED',
        errorMessage: this.explainTelegramError(description),
      };
    }

    return {
      status: 'SENT',
      providerMessageId: data?.result?.message_id
        ? String(data.result.message_id)
        : undefined,
    };
  }

  private explainTelegramError(description: string): string {
    const normalized = description.toLowerCase();

    if (normalized.includes('chat not found')) {
      return 'Telegram says “chat not found”. Verify the configured destination. For a private chat, open the bot and press /start first. For a group, add the bot to that group. For a channel, add the bot as an administrator with permission to post. Then replace the destination with the exact numeric chat ID (supergroups often start with -100) or the public channel username such as @yourchannel. A t.me invite/message link is not a chat ID.';
    }

    if (normalized.includes('bot was blocked by the user')) {
      return 'The recipient has blocked this bot. Ask them to open the bot and press /start, then retry.';
    }

    if (
      normalized.includes('not enough rights') ||
      normalized.includes('have no rights to send') ||
      normalized.includes('chat_write_forbidden')
    ) {
      return 'The bot does not have permission to post in this Telegram chat. Add it to the group, or grant the bot permission to post in the channel.';
    }

    if (normalized.includes('bot is not a member')) {
      return 'The bot is not a member of the target Telegram chat. Add the bot to the group/channel and retry.';
    }

    return description;
  }
}
