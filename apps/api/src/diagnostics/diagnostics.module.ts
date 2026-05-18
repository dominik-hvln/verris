import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/audit/audit.module';
import { HostingDiagnosticsService } from './hosting-diagnostics.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [HostingDiagnosticsService],
  exports: [HostingDiagnosticsService],
})
export class DiagnosticsModule {}
