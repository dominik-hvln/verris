import { Module } from '@nestjs/common';
import { ProductOpsAdminController } from './product-ops.admin.controller';
import { StatusModule } from '../status/status.module';
import { MeFeatureFlagsController } from './me-feature-flags.controller';

@Module({
  imports: [StatusModule],
  controllers: [ProductOpsAdminController, MeFeatureFlagsController],
})
export class ProductOpsModule {}
