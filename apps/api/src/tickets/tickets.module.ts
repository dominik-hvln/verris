import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { CannedResponseService } from './canned-response.service';
import { TicketSlaScheduler } from './ticket-sla.scheduler';
import { TicketContextService } from './ticket-context.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TicketsController],
  providers: [TicketsService, CannedResponseService, TicketSlaScheduler, TicketContextService],
  exports: [TicketsService, CannedResponseService],
})
export class TicketsModule {}
