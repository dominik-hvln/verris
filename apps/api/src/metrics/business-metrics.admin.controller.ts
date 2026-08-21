import { Controller, Get, UseGuards } from '@nestjs/common';
import { Role } from '@verris/database';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BusinessMetricsService } from './business-metrics.service';

/** BIZ-1 — metryki biznesowe (MRR/churn/flota) dla panelu admina. */
@Controller('admin/metrics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class BusinessMetricsAdminController {
  constructor(private readonly metrics: BusinessMetricsService) {}

  @Get('business')
  business() {
    return this.metrics.business();
  }
}
