import { Module } from '@nestjs/common';
import { AutoscalingPricingService } from './autoscaling-pricing.service.js';
import { AutoscalingEngineService } from './autoscaling-engine.service.js';
import { AutoscalingBillingService } from './autoscaling-billing.service.js';
import { AutoscalingBillingScheduler } from './autoscaling-billing.scheduler.js';
import { AutoscalingController } from './autoscaling.controller.js';
import { AutoscalingAdminController } from './autoscaling.admin.controller.js';
import { ServersModule } from '../servers/servers.module.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [ServersModule, BillingModule],
  providers: [
    AutoscalingPricingService,
    AutoscalingBillingService,
    AutoscalingEngineService,
    AutoscalingBillingScheduler,
  ],
  controllers: [AutoscalingController, AutoscalingAdminController],
  exports: [AutoscalingPricingService, AutoscalingEngineService],
})
export class AutoscalingModule {}
