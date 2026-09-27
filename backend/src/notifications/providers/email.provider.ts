import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommunicationChannelType } from '@prisma/client';
import { NotificationProvider, ProviderSendResult } from '../types';

// Sends via backend SMTP (nodemailer). Requires EMAIL_HOST / EMAIL_PORT /
// EMAIL_USER / EMAIL_PASSWORD / EMAIL_FROM in the environment. Destination
// may be a single address or a comma-separated list of recipients.
@Injectable()
export class EmailProvider implements NotificationProvider {
  readonly channelType = CommunicationChannelType.EMAIL;

  constructor(private config: ConfigService) {}

  async send(destination: string, message: string): Promise<ProviderSendResult> {
    const host = this.config.get<string>('EMAIL_HOST');
    const port = this.config.get<string>('EMAIL_PORT');
    const user = this.config.get<string>('EMAIL_USER');
    const password = this.config.get<string>('EMAIL_PASSWORD');
    const from = this.config.get<string>('EMAIL_FROM');

    if (!host || !from) {
      return { status: 'CONFIGURATION_REQUIRED' };
    }

    const recipients = destination
      ?.split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    if (!recipients?.length) {
      return { status: 'FAILED', errorMessage: 'Missing email recipient(s)' };
    }

    try {
      // Lazy import so the dependency is only required when email is actually used.
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port: port ? Number(port) : 587,
        secure: Number(port) === 465,
        auth: user ? { user, pass: password } : undefined,
      });

      const [subject, ...bodyLines] = message.split('\n');
      const info = await transporter.sendMail({
        from,
        to: recipients.join(', '),
        subject: subject || 'Virtual Patrol notification',
        text: message,
        html: `<p>${(bodyLines.join('<br/>') || message).replace(/\n/g, '<br/>')}</p>`,
      });

      return { status: 'SENT', providerMessageId: info?.messageId };
    } catch (err: any) {
      return {
        status: 'FAILED',
        errorMessage: err?.message || 'Email send failed',
      };
    }
  }
}
