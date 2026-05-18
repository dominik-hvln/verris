import { Module } from '@nestjs/common';
import { ProductOpsAdminController } from './product-ops.admin.controller';
import { StatusModule } from '../status/status.module';

@Module({
  imports: [StatusModule],
  controllers: [ProductOpsAdminController],
})
export class ProductOpsModule {}
