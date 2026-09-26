import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';
import { AuditAdminController } from './audit.admin.controller.js';

@Global()
@Module({
  providers: [AuditService],
  controllers: [AuditAdminController],
  exports: [AuditService],
})
export class AuditModule {}
