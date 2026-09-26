import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { AddonService } from './addon.service.js';
import { AddonController } from './addon.controller.js';

/** P-8 — one-time add-on store. */
@Module({
  imports: [BillingModule, TicketsModule],
  controllers: [AddonController],
  providers: [AddonService],
})
export class AddonModule {}
