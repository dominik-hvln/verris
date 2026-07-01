import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsSitesService } from './analytics-sites.service';

/**
 * AN — retencja zdarzeń analityki. Raz dziennie usuwa zdarzenia starsze niż
 * RETENTION_DAYS (RODO: minimalizacja danych — trzymamy tylko okno raportowe).
 */
@Injectable()
export class AnalyticsRetentionScheduler {
  private readonly logger = new Logger(AnalyticsRetentionScheduler.name);
  private busy = false;

  constructor(private readonly analytics: AnalyticsSitesService) {}

  @Cron('30 3 * * *', { name: 'analytics-retention-purge' })
  async purge(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.analytics.purgeOld();
    } catch (err) {
      this.logger.error(`Analytics retention purge failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }
}
