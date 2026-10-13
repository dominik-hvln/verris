import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

/**
 * D1 (10.10) — pulpit i liczniki menu dla operatora z DASHBOARD_VIEW. Weryfikacja 11.10 — przychody, portfel i liczba
 * klientów w „Stanie platformy” tylko z METRICS_VIEW (L4, Finanse, ADMIN); reszta pulpitu bez zmian.
 */
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('DASHBOARD_VIEW')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('overview')
  async overview(@CurrentUser() op: { userId: string; principalUserId?: string; role: string }) {
    return this.dashboard.overview(await this.dashboard.zakres(op));
  }

  /** PB-34 — liczniki w menu panelu admina (lekkie, na każdą nawigację). */
  @Get('menu')
  menu() {
    return this.dashboard.menu();
  }
}
