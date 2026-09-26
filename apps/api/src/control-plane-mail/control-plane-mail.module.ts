import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { AuditModule } from '../common/audit/audit.module.js';
import { MailModule } from '../mail/mail.module.js';
import { ControlPlaneMailService } from './control-plane-mail.service.js';
import { PostfixMapSyncService } from './postfix-map-sync.service.js';
import { SogoAuthSyncService } from './sogo-auth-sync.service.js';
import { ControlPlaneMailAdminController } from './control-plane-mail.admin.controller.js';
import { ControlPlaneMailStaffController } from './control-plane-mail.staff.controller.js';
import { ControlPlaneMailPublicController } from './control-plane-mail-public.controller.js';

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
