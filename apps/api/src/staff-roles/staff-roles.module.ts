import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { StaffRolesService } from './staff-roles.service';
import { StaffRolesAdminController, StaffMeController } from './staff-roles.admin.controller';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';

/** RBAC — role/działy staffa + granularne uprawnienia panelu. */
@Module({
  imports: [MailModule],
  controllers: [StaffRolesAdminController, StaffMeController],
  providers: [StaffRolesService, StaffPermissionsGuard],
  exports: [StaffRolesService],
})
export class StaffRolesModule {}
