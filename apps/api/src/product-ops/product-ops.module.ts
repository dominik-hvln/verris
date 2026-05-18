import { Module } from '@nestjs/common';
import { ProductOpsAdminController } from './product-ops.admin.controller';

@Module({
  controllers: [ProductOpsAdminController],
})
export class ProductOpsModule {}
