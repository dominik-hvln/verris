import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { walletLowBalanceTemplate } from '../mail/templates/billing-lifecycle-notifications';

const DEFAULT_DAILY_HOUR = 9; // 09:00 in the server's timezone (config trumps).

/**
 * Daily scheduler that warns users when their wallet balance is below the
 * "low balance" threshold (Sprint 2.1).
 *
 * Why daily and not real-time:
 *   - We don't want to spam right after every CHARGE_USAGE debit — the
 *     balance is constantly fluctuating and a single notification per day
 *     gives a clearer signal.
 *   - "Daily at 09:00" maximizes the chance the customer reads it during
 *     their work day, which improves time-to-resolve before any service
 *     gets suspended.
 *
 * Threshold logic:
 *   - If user has `WalletAutoTopup` enabled → use `2 × auto-topup-threshold`
 *     so customers see the warning *before* their card gets charged
 *     (and have time to disable auto-topup if they don't want it).
 *   - Otherwise → use `WALLET_LOW_BALANCE_DEFAULT_PLN` (default: 20.00 PLN).
 *
 * Anti-spam: each notification creates an `AuditLog` row with action
 * `WALLET_LOW_BALANCE_NOTIFIED`. We don't re-notify the same user within
 * 7 days unless the balance dropped further (≥ 50% lower than at last
 * notification). After top-up the cycle resets — first time crossing the
 * threshold again triggers a new notification.
 */
@Injectable()
export class WalletLowBalanceScheduler {
  private readonly logger = new Logger(WalletLowBalanceScheduler.name);
  private readonly defaultThresholdPln: number;
  private readonly notifyCooldownMs = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('WALLET_LOW_BALANCE_DEFAULT_PLN');
    const parsed = raw ? Number.parseFloat(raw) : NaN;
    this.defaultThresholdPln = Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'wallet:low-balance-check' })
  async hourlyTick(): Promise<void> {
    // Run only at the configured hour-of-day to keep the daily cadence.
    const now = new Date();
    const wantHour = Number.parseInt(
      this.config.get<string>('WALLET_LOW_BALANCE_HOUR') ?? `${DEFAULT_DAILY_HOUR}`,
      10,
    );
    if (Number.isFinite(wantHour) && now.getHours() !== wantHour) {
      return;
    }

    try {
      await this.run();
    } catch (err) {
      this.logger.error(
        `Wallet low-balance scheduler failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  async run(): Promise<void> {
    // Pull every user with a non-anonymized account whose wallet balance is
    // below the `defaultThresholdPln`. We over-fetch and filter in code
    // because each user may have a different per-auto-topup threshold.
    const candidates = await this.prisma.user.findMany({
      where: {
        anonymizedAt: null,
        walletBalance: { lt: new Prisma.Decimal(this.defaultThresholdPln) },
      },
      include: {
        walletAutoTopup: true,
      },
      take: 500,
    });

    const now = Date.now();
    let sent = 0;
    let skipped = 0;

    for (const user of candidates) {
      const threshold = this.thresholdFor(user);
      if (user.walletBalance.greaterThanOrEqualTo(threshold)) {
        skipped += 1;
        continue;
      }

      const lastNotification = await this.prisma.auditLog.findFirst({
        where: { userId: user.id, action: 'WALLET_LOW_BALANCE_NOTIFIED' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, details: true },
      });
      if (lastNotification) {
        const ageMs = now - lastNotification.createdAt.getTime();
        if (ageMs < this.notifyCooldownMs) {
          // Allow re-notification only if balance dropped ≥ 50% since last alert.
          const lastBalanceRaw = (lastNotification.details as { balance?: string } | null)
            ?.balance;
          const lastBalance = lastBalanceRaw ? Number.parseFloat(lastBalanceRaw) : NaN;
          const currentBalance = Number.parseFloat(user.walletBalance.toString());
          if (
            !Number.isFinite(lastBalance) ||
            currentBalance >= lastBalance * 0.5 // not "≥ 50% lower"
          ) {
            skipped += 1;
            continue;
          }
        }
      }

      const burnRate = await this.estimateDailyBurnRate(user.id);
      const daysUntilEmpty =
        burnRate > 0
          ? Math.max(0, Math.floor(Number.parseFloat(user.walletBalance.toString()) / burnRate))
          : null;

      const message = walletLowBalanceTemplate({
        to: user.email,
        firstName: user.firstName,
        currentBalance: user.walletBalance.toFixed(2),
        thresholdBalance: threshold.toFixed(2),
        daysUntilEmpty,
        hasAutoTopup: !!user.walletAutoTopup?.enabled,
        nextAutoTopupAt: user.walletAutoTopup?.cooldownUntil ?? null,
        panelUrl: this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl',
      });

      try {
        await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
        await this.audit.record({
          action: 'WALLET_LOW_BALANCE_NOTIFIED',
          userId: user.id,
          details: {
            balance: user.walletBalance.toFixed(2),
            threshold: threshold.toFixed(2),
            daysUntilEmpty,
          },
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to send wallet-low-balance email to user=${user.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `wallet-low-balance: ${sent} notifications sent, ${skipped} skipped (cooldown / above threshold)`,
    );
  }

  /**
   * Computes the active "warning threshold" for a user. Auto-topup users
   * get warned at 2× their auto-topup threshold so the warning fires
   * *before* the next auto-charge runs. Manual users get a fixed default.
   */
  private thresholdFor(user: {
    walletAutoTopup: { enabled: boolean; threshold: Prisma.Decimal } | null;
  }): Prisma.Decimal {
    if (user.walletAutoTopup?.enabled && user.walletAutoTopup.threshold) {
      const t = user.walletAutoTopup.threshold;
      return t.mul(2);
    }
    return new Prisma.Decimal(this.defaultThresholdPln);
  }

  /**
   * Returns average daily wallet spend over the last 14 days (in PLN).
   * Used to estimate "days until empty" — informational only, never a hard
   * gate. Returns 0 if no spend / no history (we then omit the line).
   */
  private async estimateDailyBurnRate(userId: string): Promise<number> {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const debits = await this.prisma.walletTransaction.aggregate({
      where: {
        userId,
        createdAt: { gte: since },
        type: { in: ['CHARGE_SUBSCRIPTION', 'CHARGE_AUTOSCALING', 'CHARGE_USAGE'] },
      },
      _sum: { amount: true },
    });
    const total = Number.parseFloat(debits._sum.amount?.toString() ?? '0');
    if (!Number.isFinite(total) || total <= 0) return 0;
    return total / 14;
  }
}
