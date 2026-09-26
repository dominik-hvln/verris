import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { SlaCreditScheduler } from './sla-credit.scheduler.js';

/** N-16 — podgląd rekompensat SLA za poprzedni miesiąc, bez zapisu. */
@Controller('admin/sla')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('BILLING_VIEW')
export class SlaAdminController {
  constructor(private readonly sla: SlaCreditScheduler) {}

  @Get('podglad')
  async podglad() {
    const { okres, pozycje } = await this.sla.wylicz();
    return {
      okres,
      pozycje: pozycje.map((p) => ({
        subscriptionId: p.subscriptionId,
        domain: p.domain,
        planName: p.planName,
        dostepnosc: (p.availabilityBp / 100).toFixed(2),
        progProcent: p.tierPercent,
        przestojMin: Math.round(p.downtimeMin),
        konserwacjaMin: Math.round(p.excusedMin),
        kwota: p.amount.toFixed(2),
        waluta: p.currency,
      })),
      suma: pozycje.reduce((a, p) => a + Number(p.amount.toFixed(2)), 0).toFixed(2),
    };
  }
}
