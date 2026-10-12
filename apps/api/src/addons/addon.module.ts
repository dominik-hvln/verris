import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { TicketsModule } from '../tickets/tickets.module.js';
import { AddonService } from './addon.service.js';
import { AddonController } from './addon.controller.js';
import { DodatkiOperatoraAdminController, ZleceniaDodatkowAdminController } from './dodatki-operatora.admin.controller.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';

/** P-8 — one-time add-on store; F3.5 — dodatki dodawane przez obsługę (karta usługi, wniosek ADDON_ADD); M-33 — zamykanie zleceń. */
@Module({
  imports: [BillingModule, TicketsModule],
  controllers: [AddonController, DodatkiOperatoraAdminController, ZleceniaDodatkowAdminController],
  providers: [AddonService, StaffPermissionsGuard],
  exports: [AddonService],
})
export class AddonModule {}
