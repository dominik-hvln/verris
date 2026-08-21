import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';
import { PartnersAdminController } from './partners.admin.controller';
import { PartnerCommissionScheduler } from './partner-commission.scheduler';

@Module({
  imports: [BillingModule, PlatformSettingsModule],
  providers: [PartnersService, PartnerCommissionScheduler],
  controllers: [PartnersController, PartnersAdminController],
  exports: [PartnersService],
})
export class PartnersModule {}
