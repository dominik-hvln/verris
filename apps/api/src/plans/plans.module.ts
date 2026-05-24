import { forwardRef, Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlanStripeSyncService } from './plan-stripe-sync.service';
import { PlansController } from './plans.controller';
import { PlansAdminController } from './plans.admin.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [forwardRef(() => BillingModule)],
  providers: [PlansService, PlanStripeSyncService],
  controllers: [PlansController, PlansAdminController],
  exports: [PlansService],
})
export class PlansModule {}
