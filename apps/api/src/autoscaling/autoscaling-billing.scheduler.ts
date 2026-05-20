import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  AutoscalingDirection,
  AutoscalingPriceRule,
  Prisma,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { AutoscalingEngineService } from './autoscaling-engine.service';
import {
  hourlyCostBreakdownForCatalogAmounts,
  scaledDiskMbToCatalogGb,
  scaledRamMbToCatalogGb,
} from './autoscaling-pricing.util';

/**
 * Charges customers for active autoscaling deltas once per hour.
 *
 * Idempotency: each charge uses a deterministic key
 *   `autoscale:<subId>:<yyyymmddhh>` (UTC bucket)
 * so re-running the cron (cold restart, deploy mid-hour, …) never
 * double-bills.
 *
 * If the wallet refuses (insufficient funds), we *don't* block — the engine's
 * D-7 guard will pick up the empty wallet on its very next minute tick and
 * scale the customer back to baseline + flip `autoscalingEnabled=false`. Until
 * then they're effectively granted a few minutes of free overage; that's an
 * acceptable trade-off for keeping their site online vs. an angry phone call.
 */
@Injectable()
export class AutoscalingBillingScheduler {
  private readonly logger = new Logger(AutoscalingBillingScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
    private readonly engine: AutoscalingEngineService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'autoscaling-billing' })
  async chargeHourly(referenceDate: Date = new Date()) {
    const started = Date.now();
    const subs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        autoscalingEnabled: true,
        account: {
          OR: [
            { scaledCpu: { gt: 0 } },
            { scaledRamMb: { gt: 0 } },
            { scaledDiskMb: { gt: 0 } },
          ],
        },
      },
      include: { account: true },
    });

    if (subs.length === 0) {
      this.logger.debug('Autoscaling billing tick — nothing to charge');
      return { processed: 0, charged: 0, skipped: 0, failed: 0 };
    }

    const rules = await this.prisma.autoscalingPriceRule.findMany({
      where: { isActive: true },
    });

    const bucket = utcHourBucket(referenceDate);

    let charged = 0;
    let skipped = 0;
    let failed = 0;

    for (const sub of subs) {
      if (!sub.account) {
        skipped += 1;
        continue;
      }

      const breakdown = hourlyCostBreakdownForCatalogAmounts(rules, {
        cpuPercent: sub.account.scaledCpu,
        ramGb: scaledRamMbToCatalogGb(sub.account.scaledRamMb),
        diskGb: scaledDiskMbToCatalogGb(sub.account.scaledDiskMb),
      });
      if (breakdown.total <= 0) {
        skipped += 1;
        continue;
      }

      const amount = roundToCurrency(breakdown.total);
      const share = allocateChargeShares(amount, breakdown);
      const idempotencyKey = `autoscale:${sub.id}:${bucket}`;

      try {
        const tx = await this.walletLedger.debit({
          userId: sub.userId,
          type: WalletTxType.CHARGE_AUTOSCALING,
          amount,
          description: `Autoscaling ${bucket} (cpu+${sub.account.scaledCpu}% ram+${sub.account.scaledRamMb}MB disk+${sub.account.scaledDiskMb}MB)`,
          idempotencyKey,
          subscriptionId: sub.id,
          metadata: {
            revenueCpuPln: share.cpu,
            revenueRamPln: share.ram,
            revenueDiskPln: share.disk,
            bucket,
          },
        });

        await this.prisma.autoscalingEvent.create({
          data: {
            subscriptionId: sub.id,
            direction: AutoscalingDirection.UP, // charge on existing UP
            reason: `hourly_charge ${bucket} tx=${tx.id}`,
            costSnapshot: new Prisma.Decimal(amount),
          },
        });

        charged += 1;
      } catch (err) {
        const e = err as Error & { code?: string };
        // Wallet may legitimately reject (insufficient funds) — engine will
        // disable autoscaling on the next minute. Anything else, log loudly.
        if (e.message.includes('insufficient') || e.message.includes('Insufficient')) {
          this.logger.warn(
            `Wallet insufficient for sub=${sub.id} amount=${amount} — engine will disable next tick`,
          );
        } else {
          this.logger.error(
            `Failed to charge autoscaling for sub=${sub.id} amount=${amount}: ${e.message}`,
          );
        }
        failed += 1;
      }
    }

    this.logger.log(
      `Autoscaling billing done in ${Date.now() - started}ms ` +
        `(processed=${subs.length} charged=${charged} skipped=${skipped} failed=${failed})`,
    );
    return { processed: subs.length, charged, skipped, failed };
  }
}

function utcHourBucket(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, '0');
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = date.getUTCDate().toString().padStart(2, '0');
  const hh = date.getUTCHours().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}${hh}`;
}

function roundToCurrency(value: number): number {
  // 4 decimal places — we want sub-grosz precision for hourly sums but the
  // wallet column itself is `Decimal(12,2)`, so the ledger truncates anyway.
  return Math.round(value * 10_000) / 10_000;
}

function allocateChargeShares(
  total: number,
  breakdown: { cpu: number; ram: number; disk: number; total: number },
): { cpu: string; ram: string; disk: string } {
  if (breakdown.total <= 0) {
    return { cpu: '0', ram: '0', disk: '0' };
  }
  const cpu = roundToCurrency((breakdown.cpu / breakdown.total) * total);
  const ram = roundToCurrency((breakdown.ram / breakdown.total) * total);
  const disk = roundToCurrency(Math.max(0, total - cpu - ram));
  return { cpu: cpu.toFixed(4), ram: ram.toFixed(4), disk: disk.toFixed(4) };
}
