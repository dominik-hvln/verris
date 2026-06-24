import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

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
