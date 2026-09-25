import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ControlPlaneMailService } from './control-plane-mail.service';

@Controller('staff/mail')
// Własna skrzynka operatora (po userId z tokenu) — każdy STAFF widzi swoje dane logowania; wcześniejszy wymóg
// SETTINGS_MANAGE dawał 403 i błąd serwera na /settings/mail w panelu obsługi dla zwykłej roli.
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STAFF, Role.ADMIN)
export class ControlPlaneMailStaffController {
  constructor(private readonly mail: ControlPlaneMailService) {}

  /** Ustawienia IMAP/SMTP + link SOGo — bez webmaila w panelu. */
  @Get('connection-info')
  connectionInfo(@CurrentUser() user: { userId: string }) {
    return this.mail.getStaffConnectionInfo(user.userId);
  }
}
