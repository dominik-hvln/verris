import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { VpsService } from './vps.service';
import { HetznerClient } from './hetzner.client';
import { VpsController } from './vps.controller';
import { VpsAdminController } from './vps.admin.controller';
import { VpsRenewalScheduler } from './vps-renewal.scheduler';

/** VPS / Cloud resale via Hetzner Cloud API. */
@Module({
  imports: [BillingModule],
  controllers: [VpsController, VpsAdminController],
  providers: [VpsService, HetznerClient, VpsRenewalScheduler],
  exports: [VpsService],
})
export class VpsModule {}
