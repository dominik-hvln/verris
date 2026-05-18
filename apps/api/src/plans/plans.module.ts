import { forwardRef, Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlansAdminController } from './plans.admin.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [forwardRef(() => BillingModule)],
  providers: [PlansService],
  controllers: [PlansController, PlansAdminController],
  exports: [PlansService],
})
export class PlansModule {}
