import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannelType } from '@prisma/client';
import { NotificationProvider, ProviderSendResult } from '../types';

// Sends via the official WhatsApp Business Platform (Cloud API).
// Requires WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to be configured
// server-side. Never accepts or exposes these credentials via the frontend.
@Injectable()
export class WhatsAppProvider implements NotificationProvider {
  readonly channelType = CommunicationChannelType.WHATSAPP;

  constructor(private config: ConfigService) {}

  async send(destination: string, message: string): Promise<ProviderSendResult> {
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');

    if (!accessToken || !phoneNumberId) {
      return { status: 'CONFIGURATION_REQUIRED' };
    }

    if (!destination?.trim()) {
      return { status: 'FAILED', errorMessage: 'Missing WhatsApp destination' };
    }

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: destination,
            type: 'text',
            text: { body: message },
          }),
        },
      );

      const data: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          status: 'FAILED',
          errorMessage:
            data?.error?.message || `WhatsApp API responded with ${res.status}`,
        };
      }

      return {
        status: 'SENT',
        providerMessageId: data?.messages?.[0]?.id,
      };
    } catch (err: any) {
      return {
        status: 'FAILED',
        errorMessage: err?.message || 'WhatsApp request failed',
      };
    }
  }
}
