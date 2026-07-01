import { Module } from '@nestjs/common';
import { ResellerService } from './reseller.service';
import { ResellerController } from './reseller.controller';
import { ResellerAdminController } from './reseller.admin.controller';

@Module({
  providers: [ResellerService],
  controllers: [ResellerController, ResellerAdminController],
  exports: [ResellerService],
})
export class ResellerModule {}
