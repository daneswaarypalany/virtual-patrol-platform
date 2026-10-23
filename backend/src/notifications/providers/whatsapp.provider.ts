import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannelType } from '@prisma/client';
import { NotificationProvider, ProviderSendResult } from '../types';

/**
 * Sends approved WhatsApp template messages through Meta's WhatsApp Cloud API.
 *
 * Required environment variables:
 *   WHATSAPP_ACCESS_TOKEN
 *   WHATSAPP_PHONE_NUMBER_ID
 *
 * Optional environment variables:
 *   WHATSAPP_GRAPH_API_VERSION  Default: v26.0
 *   WHATSAPP_TEMPLATE_NAME      Default: patrol_alert
 *   WHATSAPP_TEMPLATE_LANG      Default: en_US
 *   WHATSAPP_TEMPLATE_PARAMS    Default: 1 (use 0 for a template with no body variables)
 *
 * Keep these credentials in the backend environment only. Never expose them in
 * frontend variables (for example, variables prefixed with VITE_).
 */
@Injectable()
export class WhatsAppProvider implements NotificationProvider {
  readonly channelType = CommunicationChannelType.WHATSAPP;

  constructor(private readonly config: ConfigService) {}

  async send(destination: string, message: string): Promise<ProviderSendResult> {
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN')?.trim();
    const phoneNumberId = this.config
      .get<string>('WHATSAPP_PHONE_NUMBER_ID')
      ?.trim();

    if (!accessToken || !phoneNumberId) {
      return {
        status: 'CONFIGURATION_REQUIRED',
        errorMessage:
          'WhatsApp is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the backend environment.',
      };
    }

    const recipient = destination?.trim();
    if (!recipient) {
      return { status: 'FAILED', errorMessage: 'Missing WhatsApp destination.' };
    }

    const configuredVersion =
      this.config.get<string>('WHATSAPP_GRAPH_API_VERSION')?.trim() || 'v26.0';
    const graphVersion = configuredVersion.startsWith('v')
      ? configuredVersion
      : `v${configuredVersion}`;

    // Refuse malformed versions rather than constructing an unexpected URL.
    if (!/^v\d+\.\d+$/.test(graphVersion)) {
      return {
        status: 'FAILED',
        errorMessage:
          'Invalid WHATSAPP_GRAPH_API_VERSION. Use a version such as v26.0.',
      };
    }

    const templateName =
      this.config.get<string>('WHATSAPP_TEMPLATE_NAME')?.trim() ||
      'patrol_alert';
    const languageCode =
      this.config.get<string>('WHATSAPP_TEMPLATE_LANG')?.trim() || 'en_US';
    const rawParamCount =
      this.config.get<string>('WHATSAPP_TEMPLATE_PARAMS')?.trim() || '1';
    const paramCount = Number(rawParamCount);

    // This provider receives one message string, so it supports either a
    // parameterless template or a template with exactly one body variable.
    if (paramCount !== 0 && paramCount !== 1) {
      return {
        status: 'FAILED',
        errorMessage:
          'WHATSAPP_TEMPLATE_PARAMS must be 0 or 1. This provider supplies one message value to {{1}}.',
      };
    }

    const template: Record<string, unknown> = {
      name: templateName,
      language: { code: languageCode },
    };

    if (paramCount === 1) {
      template.components = [
        {
          type: 'body',
          parameters: [{ type: 'text', text: this.toTemplateParam(message) }],
        },
      ];
    }

    const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(
      phoneNumberId,
    )}/messages`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template,
        }),
        // Avoid leaving a test request hanging indefinitely if Meta is slow.
        signal: AbortSignal.timeout(20_000),
      });

      const data = (await response.json().catch(() => ({}))) as WhatsAppApiResponse;

      if (!response.ok) {
        return {
          status: 'FAILED',
          errorMessage: this.formatApiError(data.error, response.status),
        };
      }

      const providerMessageId = data.messages?.[0]?.id;
      return {
        status: 'SENT',
        ...(providerMessageId ? { providerMessageId } : {}),
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')
      ) {
        return {
          status: 'FAILED',
          errorMessage:
            'WhatsApp request timed out after 20 seconds. Check the backend network and retry.',
        };
      }

      return {
        status: 'FAILED',
        errorMessage:
          error instanceof Error
            ? `WhatsApp request failed: ${error.message}`
            : 'WhatsApp request failed due to an unknown error.',
      };
    }
  }

  /**
   * Make a single message safe to use as a WhatsApp template text parameter.
   * Template variables should not contain line breaks, tabs, or repeated
   * spaces. Keep the value bounded to avoid unexpectedly large payloads.
   */
  private toTemplateParam(message: string): string {
    return (message ?? '')
      .replace(/[\r\n\t]+/g, ' | ')
      .replace(/ {2,}/g, ' ')
      .trim()
      .slice(0, 1000);
  }

  /** Return Meta's code/subcode/details so authentication failures are easier to diagnose. */
  private formatApiError(
    error: WhatsAppGraphApiError | undefined,
    httpStatus: number,
  ): string {
    if (!error) {
      return `WhatsApp API responded with HTTP ${httpStatus} and no readable error details.`;
    }

    const parts: string[] = [];
    if (typeof error.code === 'number') {
      parts.push(
        `Meta error ${error.code}${typeof error.error_subcode === 'number' ? `/${error.error_subcode}` : ''}`,
      );
    } else {
      parts.push(`WhatsApp API HTTP ${httpStatus}`);
    }

    if (error.type) parts.push(`type: ${error.type}`);
    if (error.message) parts.push(error.message);
    if (error.error_data?.details) parts.push(`Details: ${error.error_data.details}`);
    if (error.fbtrace_id) parts.push(`Trace ID: ${error.fbtrace_id}`);

    return parts.join(' — ');
  }
}

interface WhatsAppApiResponse {
  messages?: Array<{ id?: string }>;
  error?: WhatsAppGraphApiError;
}

interface WhatsAppGraphApiError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  error_data?: { details?: string };
  fbtrace_id?: string;
}
