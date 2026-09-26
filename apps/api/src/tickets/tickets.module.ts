import { Module } from '@nestjs/common';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { CannedResponseService } from './canned-response.service.js';
import { TicketSlaScheduler } from './ticket-sla.scheduler.js';
import { TicketContextService } from './ticket-context.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AiModule } from '../ai/ai.module.js';
import { OpiekaZgloszenService } from './opieka-zgloszen.service.js';
import { OpiekaZgloszenAdminController } from './opieka-zgloszen.admin.controller.js';

@Module({
  imports: [NotificationsModule, AiModule],
  controllers: [TicketsController, OpiekaZgloszenAdminController],
  providers: [TicketsService, CannedResponseService, TicketSlaScheduler, TicketContextService, OpiekaZgloszenService],
  exports: [TicketsService, CannedResponseService],
})
export class TicketsModule {}
