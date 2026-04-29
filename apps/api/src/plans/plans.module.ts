import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlansAdminController } from './plans.admin.controller';

@Module({
  providers: [PlansService],
  controllers: [PlansController, PlansAdminController],
  exports: [PlansService],
})
export class PlansModule {}
