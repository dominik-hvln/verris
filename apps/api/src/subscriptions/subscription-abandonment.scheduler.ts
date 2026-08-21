import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Usuwa wiszące zamówienia bez płatności (PENDING_PAYMENT, brak konta DA > 48h).
 */
@Injectable()
export class SubscriptionAbandonmentScheduler {
  private readonly logger = new Logger(SubscriptionAbandonmentScheduler.name);

  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'subscriptions:abandon-stale-pending' })
  async handleHourly(): Promise<void> {
    try {
      const { canceled } = await this.subscriptions.abandonStalePendingPayments();
      if (canceled > 0) {
        this.logger.log(`Stale pending payments abandoned: ${canceled}`);
      }
    } catch (err) {
      this.logger.error(
        `abandon-stale-pending failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
