import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannelType } from '@prisma/client';
import { NotificationProvider, ProviderSendResult } from '../types';

// Sends via the official WhatsApp Business Platform (Cloud API) using an
// approved TEMPLATE message. Free-form text only delivers inside the 24h window
// after the recipient last messaged the business number, so it silently fails
// for proactive alerts (API returns 200, delivery fails later with error 131047).
//
// Env:
//   WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID  (required)
//   WHATSAPP_TEMPLATE_NAME   default 'patrol_alert'
//   WHATSAPP_TEMPLATE_LANG   default 'en_US' (must match the template's language exactly)
//   WHATSAPP_TEMPLATE_PARAMS default '1' — number of body variables ({{1}}..). Use '0'
//                            for parameterless templates such as Meta's 'hello_world'.
// Never accepts or exposes these credentials via the frontend.
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

    const templateName =
      this.config.get<string>('WHATSAPP_TEMPLATE_NAME') || 'patrol_alert';
    const languageCode =
      this.config.get<string>('WHATSAPP_TEMPLATE_LANG') || 'en_US';
    const paramCount = Number(
      this.config.get<string>('WHATSAPP_TEMPLATE_PARAMS') ?? '1',
    );

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
            type: 'template',
            template: {
              name: templateName,
              language: { code: languageCode },
              ...(paramCount > 0 && {
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: this.toTemplateParam(message) },
                    ],
                  },
                ],
              }),
            },
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

  // Template variables may not contain newlines, tabs or 4+ consecutive spaces,
  // and are capped in length. Flatten the message accordingly.
  private toTemplateParam(message: string): string {
    return message
      .replace(/[\r\n\t]+/g, ' | ')
      .replace(/ {2,}/g, ' ')
      .trim()
      .slice(0, 1000);
  }
}