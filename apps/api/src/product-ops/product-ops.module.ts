import { Module } from '@nestjs/common';
import { ProductOpsAdminController } from './product-ops.admin.controller.js';
import { StatusModule } from '../status/status.module.js';
import { MeFeatureFlagsController } from './me-feature-flags.controller.js';

@Module({
  imports: [StatusModule],
  controllers: [ProductOpsAdminController, MeFeatureFlagsController],
})
export class ProductOpsModule {}
