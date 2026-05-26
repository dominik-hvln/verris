import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { ControlPlaneMailService } from './control-plane-mail.service';
import { PostfixMapSyncService } from './postfix-map-sync.service';
import { SogoAuthSyncService } from './sogo-auth-sync.service';
import { ControlPlaneMailAdminController } from './control-plane-mail.admin.controller';
import { ControlPlaneMailStaffController } from './control-plane-mail.staff.controller';
import { ControlPlaneMailPublicController } from './control-plane-mail-public.controller';

@Module({
  imports: [PrismaModule, AuditModule, MailModule],
  controllers: [
    ControlPlaneMailAdminController,
    ControlPlaneMailStaffController,
    ControlPlaneMailPublicController,
  ],
  providers: [ControlPlaneMailService, PostfixMapSyncService, SogoAuthSyncService],
  exports: [ControlPlaneMailService, PostfixMapSyncService, SogoAuthSyncService],
})
export class ControlPlaneMailModule {}
