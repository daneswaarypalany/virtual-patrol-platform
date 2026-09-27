import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { WhatsAppProvider } from './providers/whatsapp.provider';
import { TelegramProvider } from './providers/telegram.provider';
import { EmailProvider } from './providers/email.provider';

// Reusable across the app: any module that needs to notify a site's
// configured channels (incidents, alerts, patrol events, ...) can import
// this module and inject NotificationsService.
@Module({
  providers: [NotificationsService, WhatsAppProvider, TelegramProvider, EmailProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
