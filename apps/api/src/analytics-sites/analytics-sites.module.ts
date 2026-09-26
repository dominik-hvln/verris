import { Module } from '@nestjs/common';
import { AuditModule } from '../common/audit/audit.module.js';
import { AnalyticsSitesService } from './analytics-sites.service.js';
import { AnalyticsSitesController } from './analytics-sites.controller.js';
import { AnalyticsPublicController } from './analytics-public.controller.js';
import { AnalyticsRetentionScheduler } from './analytics-retention.scheduler.js';

/**
 * AN — analityka stron klientów (privacy-first). Prisma/Config globalne;
 * potrzebujemy tylko AuditModule. Kontrolery: klient (JWT) + publiczny
 * (tracker + ingest). Scheduler pilnuje retencji.
 */
@Module({
  imports: [AuditModule],
  controllers: [AnalyticsSitesController, AnalyticsPublicController],
  providers: [AnalyticsSitesService, AnalyticsRetentionScheduler],
  exports: [AnalyticsSitesService],
})
export class AnalyticsSitesModule {}
