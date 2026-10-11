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
import { PocztaPrzychodzacaService } from './poczta/poczta-przychodzaca.service.js';
import { PocztaPrzychodzacaAdminController } from './poczta/poczta-przychodzaca.admin.controller.js';
import { MakraZgloszenService } from './makra-zgloszen.js';
import { ObecnoscZgloszenService } from './obecnosc-zgloszen.js';
import { RaportyZgloszenService } from './raporty-zgloszen.js';

@Module({
  imports: [NotificationsModule, AiModule],
  controllers: [TicketsController, OpiekaZgloszenAdminController, PocztaPrzychodzacaAdminController],
  providers: [
    TicketsService, CannedResponseService, TicketSlaScheduler, TicketContextService, OpiekaZgloszenService, PocztaPrzychodzacaService,
    MakraZgloszenService, ObecnoscZgloszenService, RaportyZgloszenService,
  ],
  exports: [TicketsService, CannedResponseService],
})
export class TicketsModule {}
