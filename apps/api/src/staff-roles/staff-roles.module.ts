import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { StaffRolesService } from './staff-roles.service.js';
import { StaffRolesAdminController, StaffMeController } from './staff-roles.admin.controller.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';

/** RBAC — role/działy staffa + granularne uprawnienia panelu. */
@Module({
  imports: [MailModule],
  controllers: [StaffRolesAdminController, StaffMeController],
  providers: [StaffRolesService, StaffPermissionsGuard],
  exports: [StaffRolesService],
})
export class StaffRolesModule {}
