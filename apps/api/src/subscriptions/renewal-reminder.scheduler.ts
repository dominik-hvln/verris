import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { PromoService } from '../billing/promo.service';
import {
  subscriptionRenewalReminderTemplate,
  type RenewalReminderWindow,
} from '../mail/templates/billing-lifecycle-notifications';

interface ReminderWindowSpec {
  window: RenewalReminderWindow;
  daysBefore: number;
  /** Half-width of the look-up window in hours (we run hourly). */
  halfWidthHours: number;
  /** AuditLog action that flags "we already sent this reminder" — idempotency key. */
  auditAction: string;
}

const REMINDER_WINDOWS: ReminderWindowSpec[] = [
  { window: 'T_MINUS_7', daysBefore: 7, halfWidthHours: 1, auditAction: 'SUBSCRIPTION_REMINDER_T7' },
  { window: 'T_MINUS_3', daysBefore: 3, halfWidthHours: 1, auditAction: 'SUBSCRIPTION_REMINDER_T3' },
  { window: 'T_MINUS_1', daysBefore: 1, halfWidthHours: 1, auditAction: 'SUBSCRIPTION_REMINDER_T1' },
];

/**
 * Sends "your subscription renews in N days" reminder emails (Sprint 2.1).
 *
 * Runs hourly. For each of the windows T-7, T-3, T-1 it picks active
 * subscriptions whose `currentPeriodEnd` falls inside the window
 * `[now + Nd - 1h, now + Nd + 1h]` and sends one email per (subscription,
 * window). Idempotency is enforced via `AuditLog.action =
 * SUBSCRIPTION_REMINDER_T{7|3|1}` on the user — once sent for a given
 * `currentPeriodEnd`, we don't re-send if Stripe shifts the period.
 *
 * Doesn't send for:
 *   - canceled / past-due / suspended subs (covered by other emails),
 *   - subs that already auto-cancel at period end (`cancelAtPeriodEnd`),
 *   - users that have been anonymized.
 */
@Injectable()
export class RenewalReminderScheduler {
  private readonly logger = new Logger(RenewalReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly promo: PromoService,
  ) {}

  @Cron('15 * * * *', { name: 'subscriptions:renewal-reminders' })
  async hourlyTick(): Promise<void> {
    for (const spec of REMINDER_WINDOWS) {
      try {
        await this.runWindow(spec);
      } catch (err) {
        this.logger.error(
          `Reminder window ${spec.window} failed: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
  }

  async runWindow(spec: ReminderWindowSpec): Promise<void> {
    const center = Date.now() + spec.daysBefore * 24 * 60 * 60 * 1000;
    const halfWidth = spec.halfWidthHours * 60 * 60 * 1000;
    const lo = new Date(center - halfWidth);
    const hi = new Date(center + halfWidth);

    const due = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        // No `cancelAtPeriodEnd` field; we use `cancelAt` (set by users
        // who scheduled cancellation at end of period). Skip those — they
        // get the cancellation email instead.
        cancelAt: null,
        currentPeriodEnd: { gte: lo, lte: hi },
      },
      include: {
        plan: true,
        account: true,
        user: true,
      },
      take: 200,
    });

    if (due.length === 0) {
      this.logger.debug(`reminder ${spec.window}: no subscriptions in window [${lo.toISOString()}..${hi.toISOString()}]`);
      return;
    }

    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    let sent = 0;
    let skipped = 0;

    for (const sub of due) {
      if (!sub.user || sub.user.anonymizedAt) {
        skipped += 1;
        continue;
      }
      // Idempotency: if we already sent this exact reminder for this period,
      // skip. The AuditLog `details.periodEndIso` discriminates between
      // periods if Stripe shifts `currentPeriodEnd` later.
      const periodEndIso = (sub.currentPeriodEnd ?? new Date()).toISOString();
      const already = await this.prisma.auditLog.findFirst({
        where: {
          userId: sub.userId,
          action: spec.auditAction,
          details: { path: ['periodEndIso'], equals: periodEndIso },
        },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }

      const planName = sub.plan?.name ?? 'Hosting Verris';
      const serviceName = sub.account?.domain ? `${planName} (${sub.account.domain})` : planName;
      const planSummary = `${planName}${sub.plan?.slug ? ` (${sub.plan.slug})` : ''}`;
      const currency = (sub.currency ?? 'PLN').toUpperCase() as 'PLN' | 'EUR' | 'USD';

      // BILL-2 — kwota odnowienia liczona tak samo jak realne obciążenie
      // (z uwzględnieniem rabatu startowego), żeby przypomnienie nie kłamało
      // po wejściu BILL-1. Wcześniej mail pokazywał `priceAmount` (cena z
      // rabatem 1. okresu), a portfel obciążany był pełną kwotą.
      const renewalDecimal = await this.promo.resolveNextRenewalAmount({
        priceAmount: sub.priceAmount,
        listPriceAmount: sub.listPriceAmount,
        appliedPromoCodeId: sub.appliedPromoCodeId,
        introDiscountPct: sub.introDiscountPct,
        introDiscountPeriodsLeft: sub.introDiscountPeriodsLeft,
      });
      const amount = renewalDecimal.toFixed(2);

      // BILL-2 — niedobór środków w portfelu (tylko płatność z portfela).
      const payFromWallet = sub.paymentSource === 'WALLET';
      const shortfallDecimal = payFromWallet
        ? renewalDecimal.minus(sub.user.walletBalance)
        : new Prisma.Decimal(0);
      const shortfallAmount =
        payFromWallet && shortfallDecimal.greaterThan(0)
          ? shortfallDecimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)
          : null;

      const message = subscriptionRenewalReminderTemplate({
        to: sub.user.email,
        firstName: sub.user.firstName,
        serviceName,
        amount,
        currency,
        renewalDate: sub.currentPeriodEnd ?? new Date(),
        window: spec.window,
        walletBalance: sub.user.walletBalance.toFixed(2),
        payFromWallet,
        planSummary,
        panelUrl,
        shortfallAmount,
      });

      try {
        await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
        await this.audit.record({
          action: spec.auditAction,
          userId: sub.userId,
          details: {
            subscriptionId: sub.id,
            periodEndIso,
            window: spec.window,
            amount,
            currency,
            shortfallAmount,
          },
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Failed to send ${spec.window} reminder for sub=${sub.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `reminder ${spec.window}: ${sent} sent, ${skipped} skipped (already-sent / anonymized)`,
    );
  }
}
