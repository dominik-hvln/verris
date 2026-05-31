import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AutoscalingBillingService } from './autoscaling-billing.service';

/**
 * Settles active autoscaling deltas in 15-minute blocks.
 *
 * Runs every 5 minutes (the engine bills the first block instantly on scale-up,
 * so brief spikes are already covered; this cron keeps sustained deltas billing
 * block-by-block and self-heals any episode the engine couldn't finish). Each
 * block is charged exactly once via a deterministic idempotency key inside
 * {@link AutoscalingBillingService.billDueBlocks}, so overlapping runs and
 * mid-block restarts never double-bill.
 *
 * This replaces the previous top-of-the-hour snapshot, which silently billed
 * nothing for any spike that reverted before HH:00 UTC.
 */
@Injectable()
export class AutoscalingBillingScheduler {
  private readonly logger = new Logger(AutoscalingBillingScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: AutoscalingBillingService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'autoscaling-billing' })
  async chargeDueBlocks(referenceDate: Date = new Date()) {
    const started = Date.now();
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        account: {
          OR: [
            { scaledCpu: { gt: 0 } },
            { scaledRamMb: { gt: 0 } },
            { scaledDiskMb: { gt: 0 } },
            // Defensive: scaled back to baseline but episode wasn't closed.
            { scaledSince: { not: null } },
          ],
        },
      },
      include: { account: true },
    });

    if (subs.length === 0) {
      this.logger.debug('Autoscaling block billing — nothing active');
      return { processed: 0, charged: 0, blocks: 0, depleted: 0 };
    }

    const rules = await this.prisma.autoscalingPriceRule.findMany({
      where: { isActive: true },
    });

    let charged = 0;
    let blocks = 0;
    let depleted = 0;

    for (const sub of subs) {
      if (!sub.account) continue;
      try {
        const result = await this.billing.billDueBlocks(
          {
            id: sub.account.id,
            subscriptionId: sub.id,
            userId: sub.userId,
            domain: sub.account.domain,
            scaledCpu: sub.account.scaledCpu,
            scaledRamMb: sub.account.scaledRamMb,
            scaledDiskMb: sub.account.scaledDiskMb,
            scaledSince: sub.account.scaledSince,
            scaledBilledUntil: sub.account.scaledBilledUntil,
          },
          rules,
          referenceDate,
        );
        if (result.blocksCharged > 0) charged += 1;
        blocks += result.blocksCharged;
        if (result.walletDepleted) depleted += 1;
      } catch (err) {
        this.logger.error(
          `Autoscaling block billing failed for sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Autoscaling block billing done in ${Date.now() - started}ms ` +
        `(processed=${subs.length} subsCharged=${charged} blocks=${blocks} walletDepleted=${depleted})`,
    );
    return { processed: subs.length, charged, blocks, depleted };
  }
}
