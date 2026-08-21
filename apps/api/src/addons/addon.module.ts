import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { TicketsModule } from '../tickets/tickets.module';
import { AddonService } from './addon.service';
import { AddonController } from './addon.controller';

/** P-8 — one-time add-on store. */
@Module({
  imports: [BillingModule, TicketsModule],
  controllers: [AddonController],
  providers: [AddonService],
})
export class AddonModule {}
