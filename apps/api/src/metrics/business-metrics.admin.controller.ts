import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { StaffPerm } from '../common/decorators/staff-permissions.decorator.js';
import { BusinessMetricsService } from './business-metrics.service.js';

/**
 * BIZ-1 — metryki biznesowe (MRR/churn/przychody/klienci) dla panelu admina. Weryfikacja 11.10 (decyzja właściciela):
 * osobne METRICS_VIEW (L4, Finanse, ADMIN) — wcześniej DASHBOARD_VIEW, które ma też L1 Konsultant.
 */
@Controller('admin/metrics')
@UseGuards(JwtAuthGuard, RolesGuard, StaffPermissionsGuard)
@Roles(Role.ADMIN, Role.STAFF)
@StaffPerm('METRICS_VIEW')
export class BusinessMetricsAdminController {
  constructor(private readonly metrics: BusinessMetricsService) {}

  @Get('business')
  business() {
    return this.metrics.business();
  }
}
