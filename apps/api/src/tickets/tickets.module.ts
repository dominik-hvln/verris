import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { CannedResponseService } from './canned-response.service';
import { TicketSlaScheduler } from './ticket-sla.scheduler';
import { TicketContextService } from './ticket-context.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { OpiekaZgloszenService } from './opieka-zgloszen.service';
import { OpiekaZgloszenAdminController } from './opieka-zgloszen.admin.controller';

@Module({
  imports: [NotificationsModule, AiModule],
  controllers: [TicketsController, OpiekaZgloszenAdminController],
  providers: [TicketsService, CannedResponseService, TicketSlaScheduler, TicketContextService, OpiekaZgloszenService],
  exports: [TicketsService, CannedResponseService],
})
export class TicketsModule {}
