import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module.js';
import { PartnersService } from './partners.service.js';
import { PartnersController } from './partners.controller.js';
import { PartnersAdminController } from './partners.admin.controller.js';
import { PartnerCommissionScheduler } from './partner-commission.scheduler.js';

@Module({
  imports: [BillingModule, PlatformSettingsModule],
  providers: [PartnersService, PartnerCommissionScheduler],
  controllers: [PartnersController, PartnersAdminController],
  exports: [PartnersService],
})
export class PartnersModule {}
