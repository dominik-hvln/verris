import { Module } from '@nestjs/common';
import { AutoscalingPricingService } from './autoscaling-pricing.service';
import { AutoscalingEngineService } from './autoscaling-engine.service';
import { AutoscalingBillingService } from './autoscaling-billing.service';
import { AutoscalingBillingScheduler } from './autoscaling-billing.scheduler';
import { AutoscalingController } from './autoscaling.controller';
import { AutoscalingAdminController } from './autoscaling.admin.controller';
import { ServersModule } from '../servers/servers.module';
import { BillingModule } from '../billing/billing.module';

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
