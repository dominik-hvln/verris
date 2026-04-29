import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module';
import { SuspiciousActivityService } from './suspicious-activity.service';

@Global()
@Module({
  imports: [AuditModule],
  providers: [SuspiciousActivityService],
  exports: [SuspiciousActivityService],
})
export class SecurityModule {}
