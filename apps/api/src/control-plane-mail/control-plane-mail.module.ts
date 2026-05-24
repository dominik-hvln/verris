import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/audit/audit.module';
import { ControlPlaneMailService } from './control-plane-mail.service';
import { PostfixMapSyncService } from './postfix-map-sync.service';
import { ControlPlaneMailAdminController } from './control-plane-mail.admin.controller';
import { ControlPlaneMailStaffController } from './control-plane-mail.staff.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [ControlPlaneMailAdminController, ControlPlaneMailStaffController],
  providers: [ControlPlaneMailService, PostfixMapSyncService],
  exports: [ControlPlaneMailService, PostfixMapSyncService],
})
export class ControlPlaneMailModule {}
