import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditAdminController } from './audit.admin.controller';

@Global()
@Module({
  providers: [AuditService],
  controllers: [AuditAdminController],
  exports: [AuditService],
})
export class AuditModule {}
