import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { VpsService } from './vps.service.js';
import { HetznerClient } from './hetzner.client.js';
import { VpsController } from './vps.controller.js';
import { VpsAdminController } from './vps.admin.controller.js';
import { VpsRenewalScheduler } from './vps-renewal.scheduler.js';

/** VPS / Cloud resale via Hetzner Cloud API. */
@Module({
  imports: [BillingModule],
  controllers: [VpsController, VpsAdminController],
  providers: [VpsService, HetznerClient, VpsRenewalScheduler],
  exports: [VpsService],
})
export class VpsModule {}
