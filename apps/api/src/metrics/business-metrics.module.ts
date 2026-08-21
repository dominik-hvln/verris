import { Module } from '@nestjs/common';
import { BusinessMetricsService } from './business-metrics.service';
import { BusinessMetricsAdminController } from './business-metrics.admin.controller';

/** BIZ-1 — metryki biznesowe. */
@Module({
  controllers: [BusinessMetricsAdminController],
  providers: [BusinessMetricsService],
})
export class BusinessMetricsModule {}
