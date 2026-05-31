import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SubscriptionStatus, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { PromoService } from '../billing/promo.service';
import { SubscriptionsService } from './subscriptions.service';

const HOURS = 60 * 60 * 1000;
const DAYS = 24 * HOURS;

/**
 * Background loop that keeps subscriptions in good standing.
 *
 * Runs every hour:
 *   1. **Renewal window** — for each subscription whose `currentPeriodEnd`
 *      is within 24h, attempt to debit the wallet for one period. On success
 *      we extend `currentPeriodEnd`. On failure (insufficient funds) we flip
 *      the subscription to PAST_DUE and start the grace timer.
 *
 *   2. **Grace expiry** — for each subscription that has been PAST_DUE for
 *      >= 3 days (configurable), suspend it on DA via
 *      `SubscriptionsService.suspend(reason='GRACE_EXPIRED')`.
 *
 * The cron is idempotent: each renewal attempt uses an idempotency key
 * derived from `subscriptionId + period start`, so re-running the same
 * window twice does not double-charge.
 */
@Injectable()
export class RenewalScheduler {
  private readonly logger = new Logger(RenewalScheduler.name);
  private readonly graceDurationMs = 3 * DAYS;
  private readonly renewalWindowMs = 24 * HOURS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
    private readonly subs: SubscriptionsService,
    private readonly audit: AuditService,
    private readonly promo: PromoService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'subscriptions:renewal-cycle' })
  async handleHourlyTick(): Promise<void> {
    this.logger.log('Renewal scheduler tick');
    try {
      await this.runRenewalWindow();
    } catch (err) {
      this.logger.error(
        `Renewal window failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
    try {
      await this.runGraceExpiry();
    } catch (err) {
      this.logger.error(
        `Grace expiry failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Renewal
  // ---------------------------------------------------------------------------

  private async runRenewalWindow(): Promise<void> {
    const now = new Date();
    const upTo = new Date(now.getTime() + this.renewalWindowMs);

    const due = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { lte: upTo },
      },
      include: { plan: { select: { slug: true } } },
      take: 200,
    });

    if (due.length === 0) return;

    // Subs the customer scheduled to cancel at period end: once we reach the
    // period boundary, finalize the cancellation instead of renewing/charging.
    // (Stripe-recurring subs are finalized by the subscription.deleted webhook;
    // here we only handle wallet/legacy rows so we never renew a sub the user
    // already asked to cancel.)
    const now2 = new Date();
    const scheduledCancels = due.filter(
      (sub) => sub.cancelAt != null && sub.cancelAt <= now2,
    );
    for (const sub of scheduledCancels) {
      if (sub.paymentSource === 'STRIPE_CARD' && sub.stripeSubscriptionId) continue;
      try {
        await this.subs.finalizeScheduledCancellation(sub.id);
        this.logger.log(`Finalized scheduled cancellation for sub=${sub.id}`);
      } catch (err) {
        this.logger.error(
          `Failed to finalize scheduled cancellation for sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    // Skip Stripe-managed recurring subs — Stripe handles their renewals via
    // `invoice.paid` webhook (C-7). We only debit the wallet for WALLET and
    // legacy STRIPE_CARD rows that have no Stripe Subscription attached yet
    // (those existed before C-7 landed).
    const eligible = due.filter((sub) => {
      // Never renew a sub the customer scheduled to cancel.
      if (sub.cancelAt != null && sub.cancelAt <= now2) return false;
      if (sub.paymentSource === 'STRIPE_CARD' && sub.stripeSubscriptionId) {
        this.logger.debug(
          `Skipping Stripe-managed sub=${sub.id} (stripeSubscriptionId=${sub.stripeSubscriptionId})`,
        );
        return false;
      }
      return sub.paymentSource === 'WALLET' || sub.paymentSource === 'STRIPE_CARD';
    });

    if (eligible.length === 0) {
      this.logger.log(
        `Found ${due.length} subscriptions due, but all are Stripe-managed; skipping wallet renewal.`,
      );
      return;
    }

    this.logger.log(
      `Found ${eligible.length} wallet-renewable subscriptions due in next 24h (of ${due.length} total)`,
    );

    for (const sub of eligible) {
      try {
        await this.attemptRenewal(sub);
      } catch (err) {
        this.logger.error(
          `Renewal of subscription=${sub.id} threw: ${(err as Error).message}`,
        );
      }
    }
  }

  private async attemptRenewal(
    sub: Awaited<ReturnType<typeof this.findRenewable>>[number],
  ): Promise<void> {
    const periodEnd = sub.currentPeriodEnd ?? new Date();
    const idempotencyKey = `sub-${sub.id}-renew-${periodEnd.toISOString().slice(0, 10)}`;

    const existing = await this.walletLedger.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      this.logger.debug(
        `Renewal idempotent hit for sub=${sub.id} key=${idempotencyKey}`,
      );
      // Treat as already-paid; just extend period if not extended yet.
      await this.extendPeriod(sub.id, periodEnd, sub.interval);
      return;
    }

    const renewalAmount = await this.promo.resolveSubscriptionRenewalAmount({
      priceAmount: sub.priceAmount,
      listPriceAmount: sub.listPriceAmount,
      appliedPromoCodeId: sub.appliedPromoCodeId,
    });

    try {
      await this.walletLedger.debit({
        userId: sub.userId,
        type: WalletTxType.CHARGE_SUBSCRIPTION,
        amount: renewalAmount,
        description: `Auto-renewal ${sub.plan.slug} (${sub.interval})`,
        idempotencyKey,
        subscriptionId: sub.id,
      });
    } catch (err) {
      // Insufficient balance / user not found / etc.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Renewal debit failed for sub=${sub.id}: ${msg}`);
      await this.markPastDue(sub.id, sub.userId, msg);
      return;
    }

    await this.extendPeriod(sub.id, periodEnd, sub.interval);
  }

  private async extendPeriod(
    subscriptionId: string,
    periodEnd: Date,
    interval: 'MONTH' | 'YEAR',
  ): Promise<void> {
    const newEnd = addInterval(periodEnd, interval);
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodEnd,
        currentPeriodEnd: newEnd,
      },
    });
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'RENEWED',
        details: { until: newEnd.toISOString() },
      },
    });
    this.logger.log(`Renewed subscription=${subscriptionId} until ${newEnd.toISOString()}`);
  }

  private async markPastDue(
    subscriptionId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'PAYMENT_FAILED',
        details: { reason },
      },
    });
    await this.audit.record({
      action: 'SUBSCRIPTION_PAST_DUE',
      userId,
      details: { subscriptionId, reason },
    });
    this.logger.warn(`Subscription=${subscriptionId} → PAST_DUE (${reason})`);
  }

  // ---------------------------------------------------------------------------
  // Grace expiry
  // ---------------------------------------------------------------------------

  private async runGraceExpiry(): Promise<void> {
    const cutoff = new Date(Date.now() - this.graceDurationMs);

    // Find subscriptions stuck in PAST_DUE for >= 3 days. We use the most
    // recent PAYMENT_FAILED event timestamp as the grace start. If there's no
    // such event, fall back to `currentPeriodEnd`.
    const candidates = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.PAST_DUE },
      include: {
        events: {
          where: { type: 'PAYMENT_FAILED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      take: 200,
    });

    for (const sub of candidates) {
      const graceStart = sub.events[0]?.createdAt ?? sub.currentPeriodEnd ?? new Date();
      if (graceStart > cutoff) continue;
      try {
        await this.subs.suspend({
          subscriptionId: sub.id,
          reason: 'GRACE_EXPIRED',
          note: `Grace period expired (${Math.round(
            (Date.now() - graceStart.getTime()) / DAYS,
          )} days past due)`,
        });
      } catch (err) {
        this.logger.error(
          `Failed to auto-suspend sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private findRenewable() {
    return this.prisma.subscription.findMany({
      include: { plan: { select: { slug: true } } },
    });
  }
}

function addInterval(from: Date, interval: 'MONTH' | 'YEAR'): Date {
  const next = new Date(from);
  if (interval === 'MONTH') next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

// suppress unused-import warning
void Prisma;
