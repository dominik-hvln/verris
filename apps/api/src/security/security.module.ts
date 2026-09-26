import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { SuspiciousActivityService } from './suspicious-activity.service.js';

@Global()
@Module({
  imports: [AuditModule],
  providers: [SuspiciousActivityService],
  exports: [SuspiciousActivityService],
})
export class SecurityModule {}
