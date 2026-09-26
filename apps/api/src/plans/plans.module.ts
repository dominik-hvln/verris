import { forwardRef, Module } from '@nestjs/common';
import { PlansService } from './plans.service.js';
import { PlanStripeSyncService } from './plan-stripe-sync.service.js';
import { PlansController } from './plans.controller.js';
import { PlansAdminController } from './plans.admin.controller.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [forwardRef(() => BillingModule)],
  providers: [PlansService, PlanStripeSyncService],
  controllers: [PlansController, PlansAdminController],
  exports: [PlansService],
})
export class PlansModule {}
