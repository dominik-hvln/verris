import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ControlPlaneMailService } from './control-plane-mail.service';

@Controller('staff/mail')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.STAFF, Role.ADMIN)
@StaffPerm('SETTINGS_MANAGE')
export class ControlPlaneMailStaffController {
  constructor(private readonly mail: ControlPlaneMailService) {}

  /** Ustawienia IMAP/SMTP + link SOGo — bez webmaila w panelu. */
  @Get('connection-info')
  connectionInfo(@CurrentUser() user: { userId: string }) {
    return this.mail.getStaffConnectionInfo(user.userId);
  }
}
