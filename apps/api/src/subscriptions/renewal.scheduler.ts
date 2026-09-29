import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ClientWebhooksService } from '../client-webhooks/client-webhooks.service.js';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import { PromoService } from '../billing/promo.service.js';
import {
  KARENCJA_PLATNOSCI_DNI,
  POWODY_ZAWIESZENIA_ZA_PLATNOSC,
  SubscriptionsService,
  ZAWIESZENIE_DO_WYGASNIECIA_DNI,
} from './subscriptions.service.js';
import { EcoPointsService } from '../eco/eco-points.service.js';

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
 *      >= 7 days (Regulamin §7 ust. 3: prolongata), suspend it on DA via
 *      `SubscriptionsService.suspend(reason='GRACE_EXPIRED')`.
 *
 *   3. **Wygaśnięcie po zawieszeniu** — zawieszona za brak płatności dłużej niż
 *      14 dni (§7 ust. 3) → `SubscriptionsService.wygasPoZawieszeniu` (EXPIRED);
 *      dalej retencja konta 14 dni i usunięcie (RetencjaKontService).
 *
 * The cron is idempotent: each renewal attempt uses an idempotency key
 * derived from `subscriptionId + period start`, so re-running the same
 * window twice does not double-charge.
 */
@Injectable()
export class RenewalScheduler {
  private readonly logger = new Logger(RenewalScheduler.name);
  private readonly graceDurationMs = KARENCJA_PLATNOSCI_DNI * DAYS;
  private readonly renewalWindowMs = 24 * HOURS;

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
    private readonly subs: SubscriptionsService,
    private readonly audit: AuditService,
    private readonly promo: PromoService,
    private readonly ecoPoints: EcoPointsService,
    @Optional() private readonly webhooks?: ClientWebhooksService,
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
    try {
      await this.runSuspensionExpiry();
    } catch (err) {
      this.logger.error(`Wygaśnięcie po zawieszeniu: ${(err as Error).message}`, (err as Error).stack);
    }
  }

  // ---------------------------------------------------------------------------
  // Renewal
  // ---------------------------------------------------------------------------

  private async runRenewalWindow(): Promise<void> {
    const now = new Date();
    const upTo = new Date(now.getTime() + this.renewalWindowMs);

    // Z-07 — PAST_DUE też: klient płacący portfelem, który doładuje saldo w karencji,
    // zostaje obciążony przy najbliższym przebiegu zamiast zawieszenia po 3 dniach.
    const due = await this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        currentPeriodEnd: { lte: upTo },
      },
      include: { plan: { select: { slug: true } } },
      orderBy: { currentPeriodEnd: 'asc' },
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

    // PB-28 — rozliczenie poza Verris (MANUAL): okres przedłuża się sam na koniec
    // okresu, bez obciążenia, faktury i karencji. Klienta rozlicza właściciel.
    for (const sub of due) {
      if (sub.paymentSource !== 'MANUAL' || !sub.currentPeriodEnd) continue;
      if (sub.cancelAt != null && sub.cancelAt <= now2) continue;
      if (sub.currentPeriodEnd > now2) continue;
      try {
        await this.extendPeriod(sub.id, sub.currentPeriodEnd, sub.interval);
      } catch (err) {
        this.logger.error(`Przedłużenie usługi poza Verris sub=${sub.id}: ${(err as Error).message}`);
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

  /**
   * Z-07 — „Opłać teraz z portfela” w panelu klienta: od razu próbuje zaległego
   * odnowienia zamiast czekać na godzinny przebieg.
   */
  async retryPastDueNow(userId: string, subscriptionId: string): Promise<{ status: string }> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { plan: { select: { slug: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (sub.status !== SubscriptionStatus.PAST_DUE) {
      throw new BadRequestException('Usługa nie ma zaległej płatności.');
    }
    if (sub.paymentSource === 'STRIPE_CARD' && sub.stripeSubscriptionId) {
      throw new BadRequestException('Ta usługa jest opłacana kartą — zaległą fakturę opłacisz w Rozliczeniach.');
    }
    const ok = await this.attemptRenewal(sub);
    if (!ok) {
      throw new BadRequestException('Za mało środków w portfelu — doładuj portfel i spróbuj ponownie.');
    }
    return { status: SubscriptionStatus.ACTIVE };
  }

  /** @returns true, gdy okres opłacono (także wcześniej — idempotencja). */
  private async attemptRenewal(
    sub: Awaited<ReturnType<typeof this.findRenewable>>[number],
  ): Promise<boolean> {
    const periodEnd = sub.currentPeriodEnd ?? new Date();
    const idempotencyKey = `sub-${sub.id}-renew-${periodEnd.toISOString().slice(0, 10)}`;

    const existing = await this.walletLedger.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      this.logger.debug(
        `Renewal idempotent hit for sub=${sub.id} key=${idempotencyKey}`,
      );
      // Treat as already-paid; just extend period if not extended yet.
      await this.extendPeriod(sub.id, periodEnd, sub.interval);
      void this.ecoPoints.safeAward(`wallet_renewal:${idempotencyKey}`, async () => {
        await this.ecoPoints.awardSubscriptionRenewal(this.prisma, {
          userId: sub.userId,
          subscriptionId: sub.id,
          referenceId: idempotencyKey,
        });
      });
      return true;
    }

    // BILL-1/BILL-2 — kwota odnowienia (z rabatem startowym, jeśli zostały okresy)
    // liczona w jednym miejscu (PromoService), wspólnie z mailem przypominającym.
    const useIntro = sub.introDiscountPeriodsLeft > 0 && sub.introDiscountPct > 0;
    const renewalAmount = await this.promo.resolveNextRenewalAmount({
      priceAmount: sub.priceAmount,
      listPriceAmount: sub.listPriceAmount,
      appliedPromoCodeId: sub.appliedPromoCodeId,
      introDiscountPct: sub.introDiscountPct,
      introDiscountPeriodsLeft: sub.introDiscountPeriodsLeft,
      individualPrice: sub.individualPrice,
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
      // Tylko brak środków (ConflictException z WalletLedgerService) otwiera karencję. Wcześniej KAŻDY
      // błąd — zerwane połączenie z bazą, timeout blokady — dawał PAST_DUE, mail „płatność nieudana”
      // i start licznika karencji do zawieszenia, choć klient miał pieniądze. Inny błąd leci dalej:
      // przebieg zaloguje go i spróbuje za godzinę, a „Opłać teraz” nie powie „za mało środków”.
      if (!(err instanceof ConflictException)) throw err;
      const msg = err.message;
      this.logger.warn(`Renewal debit failed for sub=${sub.id}: ${msg}`);
      // Ponowienie w karencji nie zapisuje nowego PAYMENT_FAILED — to zdarzenie
      // wyznacza początek karencji, a nowe co godzinę nie pozwoliłoby jej wygasnąć.
      if (sub.status !== SubscriptionStatus.PAST_DUE) {
        await this.markPastDue(sub.id, sub.userId, msg, periodEnd);
      }
      return false;
    }

    // Zużycie okresu rabatu startowego razem z przedłużeniem i tylko przez tego, kto przedłużył:
    // „Opłać teraz” w tej samej chwili co cron (to samo obciążenie przez klucz idempotencji)
    // zdejmował wcześniej dwa okresy rabatu.
    await this.extendPeriod(sub.id, periodEnd, sub.interval, useIntro);

    void this.ecoPoints.safeAward(`wallet_renewal:${idempotencyKey}`, async () => {
      await this.ecoPoints.awardSubscriptionRenewal(this.prisma, {
        userId: sub.userId,
        subscriptionId: sub.id,
        referenceId: idempotencyKey,
      });
    });
    return true;
  }

  private async extendPeriod(
    subscriptionId: string,
    periodEnd: Date,
    interval: 'MONTH' | 'YEAR',
    zuzyjRabat = false,
  ): Promise<void> {
    const newEnd = addInterval(periodEnd, interval);
    // Warunkowo na opłacany okres: drugi, równoległy przebieg dla tego samego okresu nic nie zmienia
    // (ani drugiego RENEWED, ani drugiego zużycia rabatu).
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, currentPeriodEnd: periodEnd },
      data: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodEnd,
        currentPeriodEnd: newEnd,
        ...(zuzyjRabat ? { introDiscountPeriodsLeft: { decrement: 1 } } : {}),
      },
    });
    if (count === 0) return;
    const odnowiona = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { userId: true } });
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'RENEWED',
        details: { until: newEnd.toISOString() },
      },
    });
    this.logger.log(`Renewed subscription=${subscriptionId} until ${newEnd.toISOString()}`);
    if (odnowiona?.userId) await this.webhooks?.emit(odnowiona.userId, 'subscription.renewed', { usluga: subscriptionId, do: newEnd.toISOString() });
  }

  private async markPastDue(
    subscriptionId: string,
    userId: string,
    reason: string,
    periodEnd: Date,
  ): Promise<void> {
    // Warunkowo: klient mógł w tej chwili sam opłacić okres („Opłać teraz” po doładowaniu) —
    // wtedy okres jest już przesunięty i usługa nie może wrócić do „zaległa” z karencją.
    const oznaczone = await this.prisma.subscription.updateMany({
      where: { id: subscriptionId, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: periodEnd },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
    if (oznaczone.count === 0) return;
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
    await this.webhooks?.emit(userId, 'subscription.past_due', { usluga: subscriptionId, powod: reason });
  }

  // ---------------------------------------------------------------------------
  // Grace expiry
  // ---------------------------------------------------------------------------

  private async runGraceExpiry(): Promise<void> {
    const cutoff = new Date(Date.now() - this.graceDurationMs);

    // Find subscriptions stuck in PAST_DUE for >= 7 days (prolongata z §7 ust. 3). We use the most
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
          tylkoGdyStatus: SubscriptionStatus.PAST_DUE,
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

  /**
   * Regulamin §7 ust. 3 — „jeżeli w ciągu kolejnych 14 dni zaległość nie zostanie uregulowana, Umowa
   * w zakresie tej Usługi wygasa”. Początek = ostatnie zdarzenie SUSPENDED; liczą się tylko zawieszenia
   * za brak płatności (nadużycie czy decyzja operatora nie wygaszają umowy). Błąd jednej usługi nie
   * zatrzymuje reszty — spróbujemy za godzinę.
   */
  async runSuspensionExpiry(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - ZAWIESZENIE_DO_WYGASNIECIA_DNI * DAYS);
    const candidates = await this.prisma.subscription.findMany({
      where: { status: SubscriptionStatus.SUSPENDED },
      include: { events: { where: { type: 'SUSPENDED' }, orderBy: { createdAt: 'desc' }, take: 1 } },
      take: 200,
    });
    let wygasle = 0;
    for (const sub of candidates) {
      const zawieszenie = sub.events[0];
      const powod = (zawieszenie?.details as { reason?: string } | null)?.reason;
      if (!zawieszenie || zawieszenie.createdAt > cutoff) continue;
      if (!POWODY_ZAWIESZENIA_ZA_PLATNOSC.some((p) => p === powod)) continue;
      try {
        if (await this.subs.wygasPoZawieszeniu(sub.id)) wygasle += 1;
      } catch (err) {
        this.logger.error(`Wygaśnięcie po zawieszeniu sub=${sub.id}: ${(err as Error).message}`);
      }
    }
    return wygasle;
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
