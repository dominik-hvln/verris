import { Module } from '@nestjs/common';
import { BusinessMetricsService } from './business-metrics.service.js';
import { BusinessMetricsAdminController } from './business-metrics.admin.controller.js';

/** BIZ-1 — metryki biznesowe. */
@Module({
  controllers: [BusinessMetricsAdminController],
  providers: [BusinessMetricsService],
})
export class BusinessMetricsModule {}
