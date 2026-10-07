import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { DomainRegistrarService } from './domain-registrar.service.js';

@Controller('admin/registrar')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RegistrarAdminController {
  constructor(private readonly registrar: DomainRegistrarService) {}

  /** Zgłasza OpenProviderowi adres webhooka (OP od razu wysyła zdarzenie testowe). */
  @Post('webhook')
  @HttpCode(200)
  async webhook(@CurrentUser() actor: { userId: string }) {
    return this.registrar.wlaczWebhookOp(actor.userId);
  }
}
