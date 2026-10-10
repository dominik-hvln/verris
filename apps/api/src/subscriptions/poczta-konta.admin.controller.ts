import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm, StaffPermAny } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RateLimit } from '../common/guards/rate-limit.guard.js';
import { PocztaKontaOperatoraService } from './poczta-konta-operatora.service.js';
import { PowodOperatoraDto } from './dto/akcje-konta.dto.js';

type Aktor = { userId: string; role: string };

/**
 * F3.1 (D4, 10.10) — poczta konta na karcie usługi w panelu operatora: stan i blokada wysyłki. Uprawnienia na
 * metodach: podgląd — MAIL_QUEUE_VIEW (L2) albo MAIL_SEND_BLOCK; blokada i zwolnienie — MAIL_SEND_BLOCK (L3, NOC,
 * zespół abuse). Logika i dziennik: poczta-konta-operatora.service.ts.
 */
@Controller('admin/subscriptions/:id/konto')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
export class PocztaKontaAdminController {
  constructor(private readonly poczta: PocztaKontaOperatoraService) {}

  @Get('wysylka')
  @StaffPermAny('MAIL_QUEUE_VIEW', 'MAIL_SEND_BLOCK')
  stanWysylki(@Param('id') id: string) {
    return this.poczta.stan(id);
  }

  @Post('wysylka/zablokuj')
  @HttpCode(200)
  @StaffPerm('MAIL_SEND_BLOCK')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:konto-wysylka' })
  zablokuj(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.poczta.zablokuj({ subscriptionId: id, operatorUserId: actor.userId, operatorRole: actor.role, powod: b.powod, zgloszenie: b.zgloszenie });
  }

  @Post('wysylka/zwolnij')
  @HttpCode(200)
  @StaffPerm('MAIL_SEND_BLOCK')
  @RateLimit({ limit: 60, windowMs: 60 * 60 * 1000, scope: 'admin:konto-wysylka' })
  zwolnij(@Param('id') id: string, @Body() b: PowodOperatoraDto, @CurrentUser() actor: Aktor) {
    return this.poczta.zwolnij({ subscriptionId: id, operatorUserId: actor.userId, operatorRole: actor.role, powod: b.powod, zgloszenie: b.zgloszenie });
  }
}
