import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * NTF-2 — moduł powiadomień in-app. Eksportuje serwis, by inne moduły
 * (monitoring, billing, SLA) mogły tworzyć wpisy obok wysyłki e-maili.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
