import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { HostingDiagnosticsService } from './hosting-diagnostics.service.js';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [HostingDiagnosticsService],
  exports: [HostingDiagnosticsService],
})
export class DiagnosticsModule {}
