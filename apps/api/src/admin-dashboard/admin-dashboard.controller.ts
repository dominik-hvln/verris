import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { AdminDashboardService } from './admin-dashboard.service.js';

/** D1 (10.10) — pulpit i liczniki menu dla operatora z DASHBOARD_VIEW („Pulpit i metryki biznesowe”). */
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('DASHBOARD_VIEW')
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}

  @Get('overview')
  overview() {
    return this.dashboard.overview();
  }

  /** PB-34 — liczniki w menu panelu admina (lekkie, na każdą nawigację). */
  @Get('menu')
  menu() {
    return this.dashboard.menu();
  }
}
