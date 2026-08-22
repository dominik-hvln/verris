import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { StripeService } from './stripe/stripe.service';
import {
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
  StripeInvoice,
  StripeSubscription,
} from './stripe/stripe.client';
import { InvoicesService } from './invoices.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MailerService } from '../mail/mailer.service';
import { adminCreditNotificationTemplate } from '../mail/templates/admin-credit-notification';
import {
  subscriptionPaymentFailedTemplate,
  subscriptionRenewedTemplate,
  walletAutoTopupFailedTemplate,
  walletAutoTopupOkTemplate,
  walletTopupOkTemplate,
} from '../mail/templates/billing-lifecycle-notifications';
import { rowsToCsv } from './csv.util';
import { PromoService } from './promo.service';
import { EcoPointsService } from '../eco/eco-points.service';
import {
  Decyzja,
  decyzja,
  DNI_PRZECHOWANIA_TRESCI,
  nastepnaProba,
  WierszZdarzenia,
} from './stripe/webhook-ewidencja';

export interface TransactionsCsvFilters {
  userId?: string;
  from?: Date;
  to?: Date;
  type?: WalletTxType;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly stripe: StripeService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptions: SubscriptionsService,
    private readonly mailer: MailerService,
    private readonly promo: PromoService,
    private readonly ecoPoints: EcoPointsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Wallet
  // ---------------------------------------------------------------------------

  async getWalletSummary(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, walletBalance: true, walletCurrency: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const aggregates = await this.prisma.walletTransaction.groupBy({
      by: ['type'],
      where: { userId, createdAt: { gte: since } },
      _sum: { amount: true },
    });

    const findSum = (predicate: (t: WalletTxType) => boolean) =>
      aggregates
        .filter((row) => predicate(row.type))
        .reduce((acc, row) => acc.plus(row._sum.amount ?? 0), new Prisma.Decimal(0));

    const totalTopupLast30d = findSum((t) =>
      t === WalletTxType.TOPUP || t === WalletTxType.PROMO_CREDIT || t === WalletTxType.REFUND,
    );
    const totalChargesLast30d = findSum((t) =>
      t === WalletTxType.CHARGE_SUBSCRIPTION ||
      t === WalletTxType.CHARGE_PLAN_UPGRADE ||
      t === WalletTxType.CHARGE_AUTOSCALING ||
      t === WalletTxType.CHARGE_USAGE,
    );

    const recent = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    const now = new Date();
    const since12Months = new Date(now.getFullYear(), now.getMonth() - 11, 1, 0, 0, 0, 0);
    const flowSource = await this.prisma.walletTransaction.findMany({
      where: {
        userId,
        status: 'COMPLETED',
        createdAt: { gte: since12Months },
      },
      select: { amount: true, type: true, createdAt: true },
    });
    const monthlyFlowLast12 = this.buildWalletMonthlyFlowLast12(flowSource, now);

    return {
      balance: user.walletBalance.toFixed(2),
      currency: user.walletCurrency,
      totalTopupLast30d: totalTopupLast30d.toFixed(2),
      totalChargesLast30d: totalChargesLast30d.abs().toFixed(2),
      monthlyFlowLast12,
      recentTransactions: recent.map((tx) => ({
        id: tx.id,
        type: tx.type,
        status: tx.status,
        amount: tx.amount.toFixed(2),
        currency: tx.currency,
        balanceAfter: tx.balanceAfter.toFixed(2),
        description: tx.description,
        paymentProvider: tx.paymentProvider,
        paymentRef: tx.paymentRef,
        subscriptionId: tx.subscriptionId,
        createdAt: tx.createdAt.toISOString(),
      })),
    };
  }

  private static readonly WALLET_INFLOW_TYPES = new Set<WalletTxType>([
    WalletTxType.TOPUP,
    WalletTxType.REFUND,
    WalletTxType.PROMO_CREDIT,
    WalletTxType.ADJUSTMENT,
  ]);

  private buildWalletMonthlyFlowLast12(
    transactions: { amount: Prisma.Decimal; type: WalletTxType; createdAt: Date }[],
    now: Date,
  ) {
    const monthKeys: { month: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pl-PL', { month: 'short', year: '2-digit' });
      monthKeys.push({ month, label });
    }

    const buckets = new Map(
      monthKeys.map((m) => [
        m.month,
        { label: m.label, inflow: new Prisma.Decimal(0), outflow: new Prisma.Decimal(0) },
      ]),
    );

    for (const tx of transactions) {
      const month = `${tx.createdAt.getFullYear()}-${String(tx.createdAt.getMonth() + 1).padStart(2, '0')}`;
      const bucket = buckets.get(month);
      if (!bucket) continue;
      const numeric = tx.amount;
      const isInflow =
        numeric.greaterThan(0) || BillingService.WALLET_INFLOW_TYPES.has(tx.type);
      if (isInflow) {
        bucket.inflow = bucket.inflow.plus(numeric.abs());
      } else {
        bucket.outflow = bucket.outflow.plus(numeric.abs());
      }
    }

    return monthKeys.map((m) => {
      const b = buckets.get(m.month)!;
      return {
        month: m.month,
        label: b.label,
        inflow: b.inflow.toFixed(2),
        outflow: b.outflow.toFixed(2),
      };
    });
  }

  /** Zapisane karty Stripe w bazie — wybór karty przy auto‑doładowaniu portfela. */
  async listMyPaymentMethods(userId: string) {
    const rows = await this.prisma.paymentMethod.findMany({
      where: { userId, provider: 'STRIPE' },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        brand: true,
        last4: true,
        expMonth: true,
        expYear: true,
        isDefault: true,
      },
    });
    return rows;
  }

  // ---------------------------------------------------------------------------
  // CSV export (C-15) — used by both client and admin endpoints. Streams up to
  // `MAX_ROWS` rows in a single response; for larger exports we'd paginate to
  // a background job, but the current ledger volumes (single-tenant install)
  // never get close.
  // ---------------------------------------------------------------------------

  private static readonly TX_CSV_MAX_ROWS = 50_000;

  async exportTransactionsCsv(filters: TransactionsCsvFilters): Promise<{ filename: string; csv: string }> {
    const where: Prisma.WalletTransactionWhereInput = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.type) where.type = filters.type;
    if (filters.from || filters.to) {
      where.createdAt = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }

    const rows = await this.prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: BillingService.TX_CSV_MAX_ROWS,
      include: {
        user: { select: { email: true } },
      },
    });

    const csv = rowsToCsv(rows, [
      { header: 'id', value: (r) => r.id },
      { header: 'createdAt', value: (r) => r.createdAt.toISOString() },
      { header: 'userId', value: (r) => r.userId },
      { header: 'userEmail', value: (r) => r.user.email },
      { header: 'type', value: (r) => r.type },
      { header: 'status', value: (r) => r.status },
      { header: 'amount_pln', value: (r) => r.amount.toFixed(2) },
      { header: 'amount_credits', value: (r) => (r.currency === 'PLN' ? r.amount.toFixed(2) : '') },
      { header: 'currency', value: (r) => r.currency },
      { header: 'balanceAfter', value: (r) => r.balanceAfter.toFixed(2) },
      { header: 'description', value: (r) => r.description ?? '' },
      { header: 'paymentProvider', value: (r) => r.paymentProvider ?? '' },
      { header: 'paymentRef', value: (r) => r.paymentRef ?? '' },
      { header: 'subscriptionId', value: (r) => r.subscriptionId ?? '' },
      { header: 'idempotencyKey', value: (r) => r.idempotencyKey ?? '' },
    ]);

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const scope = filters.userId ? `user-${filters.userId.slice(0, 8)}` : 'all';
    return { filename: `wallet-tx-${scope}-${stamp}.csv`, csv };
  }

  // ---------------------------------------------------------------------------
  // Admin: manual wallet credit (testing / customer service tool)
  // ---------------------------------------------------------------------------

  async adminCreditWallet(opts: {
    userId: string;
    amount: number | string;
    description?: string;
    idempotencyKey?: string;
    actorUserId: string;
  }) {
    const description = opts.description?.trim() || 'Uznanie od Zespołu Verris';

    const tx = await this.ledger.credit({
      userId: opts.userId,
      amount: opts.amount,
      type: WalletTxType.ADJUSTMENT,
      description,
      idempotencyKey: opts.idempotencyKey,
      paymentProvider: 'MANUAL',
    });

    await this.audit.record({
      action: 'WALLET_ADMIN_CREDIT',
      actorUserId: opts.actorUserId,
      userId: opts.userId,
      details: {
        walletTxId: tx.id,
        amount: tx.amount.toString(),
        description,
        idempotencyKey: opts.idempotencyKey ?? null,
      },
    });

    // Powiadom klienta. Nie blokujemy operacji, jeśli mailer padnie — ledger
    // i audyt już są zapisane, klient zobaczy operację w historii portfela
    // przy najbliższym otwarciu panelu.
    void this.notifyAdminCredit({
      userId: opts.userId,
      amount: tx.amount.toFixed(2),
      reason: description,
    }).catch((err) => {
      this.logger.warn(
        `adminCreditWallet: powiadomienie e-mail nie zostało wysłane (userId=${opts.userId}): ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    return tx;
  }

  private async notifyAdminCredit(opts: {
    userId: string;
    amount: string;
    reason: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, firstName: true, walletBalance: true },
    });
    if (!user) return;

    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ??
      this.config.get<string>('clientPanelUrl') ??
      'https://panel.verris.pl';

    const message = adminCreditNotificationTemplate({
      customerEmail: user.email,
      customerFirstName: user.firstName,
      amount: opts.amount,
      reason: opts.reason,
      newBalance: new Prisma.Decimal(user.walletBalance).toFixed(2),
      panelUrl,
    });

    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
  }

  // ---------------------------------------------------------------------------
  // Stripe: top-up checkout session
  // ---------------------------------------------------------------------------

  async createTopupCheckoutSession(opts: {
    userId: string;
    amount: number | string;
    promoCode?: string | null;
  }) {
    const amount = new Prisma.Decimal(opts.amount);
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(10000)) {
      throw new BadRequestException('Kwota doładowania musi być z zakresu (0, 10000].');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { id: true, email: true, walletCurrency: true },
    });
    if (!user) throw new NotFoundException('User not found');

    // Optional percent-bonus promo code applied during checkout. We pass the
    // promo metadata through Stripe so the post-payment webhook can credit
    // the bonus deterministically — even if the panel restarts between
    // checkout creation and Stripe paying out.
    let promoMetadata:
      | { promoCodeId: string; promoCode: string; bonusAmount: string; promoPercent: string }
      | null = null;
    if (opts.promoCode && opts.promoCode.trim()) {
      const preview = await this.promo.previewPercentBonus(user.id, opts.promoCode, amount);
      promoMetadata = {
        promoCodeId: preview.promoCodeId,
        promoCode: preview.code,
        bonusAmount: preview.bonusAmount.toFixed(2),
        promoPercent: String(preview.percent),
      };
    }

    const minor = Math.round(amount.toNumber() * 100);

    const description = promoMetadata
      ? `Doładowanie portfela Verris (${amount.toFixed(2)} ${user.walletCurrency}) + ${promoMetadata.promoPercent}% bonus „${promoMetadata.promoCode}"`
      : `Doładowanie portfela Verris (${amount.toFixed(2)} ${user.walletCurrency})`;

    const session = await this.stripe.createCheckoutSession({
      amountMinor: minor,
      currency: user.walletCurrency,
      customerEmail: user.email,
      successUrl: this.config.get<string>('stripeSuccessUrl')!,
      cancelUrl: this.config.get<string>('stripeCancelUrl')!,
      clientReferenceId: user.id,
      metadata: {
        userId: user.id,
        kind: 'wallet_topup',
        ...(promoMetadata ?? {}),
      },
      description,
    });

    await this.audit.record({
      action: 'WALLET_TOPUP_INITIATED',
      userId: user.id,
      details: {
        sessionId: session.id,
        amount: amount.toFixed(2),
        currency: user.walletCurrency,
        ...(promoMetadata ?? {}),
      },
    });

    return {
      url: session.url,
      sessionId: session.id,
      bonus: promoMetadata
        ? { amount: promoMetadata.bonusAmount, percent: Number(promoMetadata.promoPercent), code: promoMetadata.promoCode }
        : null,
    };
  }

  /**
   * Pre-checkout dry-run for the topup form. Returns the calculated bonus
   * for `(userId, amount, promoCode)` without creating a Stripe session.
   * Used by the client panel "Apply code" button.
   */
  async previewWalletTopupPromo(input: { userId: string; amount: number | string; promoCode: string }) {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(10000)) {
      throw new BadRequestException('Kwota doładowania musi być z zakresu (0, 10000].');
    }
    const preview = await this.promo.previewPercentBonus(input.userId, input.promoCode, amount);
    return {
      code: preview.code,
      percent: preview.percent,
      bonusAmount: preview.bonusAmount.toFixed(2),
      totalCredited: amount.plus(preview.bonusAmount).toFixed(2),
      description: preview.description,
    };
  }

  // ---------------------------------------------------------------------------
  // Stripe: webhook
  // ---------------------------------------------------------------------------

  async handleStripeWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
    this.stripe.verifyWebhookSignature(rawBody, signatureHeader);
    const event = this.stripe.parseEvent(rawBody);

    this.logger.log(`Stripe webhook: ${event.type} (${event.id})`);

    const zajecie = await this.zajmijZdarzenie(event);
    if (zajecie.rodzaj === 'duplikat') {
      this.logger.log(`Duplicate Stripe webhook delivery ignored: ${event.id}`);
      return { received: true, duplicate: true };
    }
    if (zajecie.rodzaj === 'wTrakcie') {
      // Inna dostawa tego samego zdarzenia jest właśnie obsługiwana. NIE wolno
      // odpowiedzieć 200 — tamta dostawa może paść, a Stripe uznałby zdarzenie
      // za doręczone. 409 każe mu ponowić później.
      this.logger.warn(`Stripe webhook ${event.id} już w obsłudze — proszę o ponowienie`);
      throw new ConflictException({
        received: false,
        reason: 'zdarzenie w trakcie obsługi',
        eventId: event.id,
      });
    }

    return this.uruchomHandler(event);
  }

  /**
   * Z-05 — zajęcie zdarzenia przed uruchomieniem handlera.
   *
   * Do 2026-08-22 stało tu samo `create()`, a jego powodzenie znaczyło
   * „widziałem". Kod czytał to jako „obsłużyłem", więc handler, który rzucił
   * wyjątkiem, zostawiał zdarzenie oznaczone jako obsłużone i ponowienie ze
   * Stripe'a dostawało 200. Klient zapłacił, saldo się nie pojawiło.
   *
   * Teraz `create()` zakłada wiersz w stanie PENDING, czyli „zajęte, w trakcie",
   * a dopiero {@link zakonczZdarzenie} przestawia go na PROCESSED.
   */
  private async zajmijZdarzenie(event: {
    id: string;
    type: string;
  }): Promise<Decyzja> {
    const teraz = new Date();
    try {
      await this.prisma.stripeWebhookEvent.create({
        data: {
          eventId: event.id,
          type: event.type,
          status: 'PENDING',
          payload: event as unknown as Prisma.InputJsonValue,
          attempts: 1,
          claimedAt: teraz,
        },
      });
      return { rodzaj: 'przetwarzaj' };
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') {
        throw err;
      }
    }

    const wiersz = await this.prisma.stripeWebhookEvent.findUnique({
      where: { eventId: event.id },
      select: { status: true, claimedAt: true, attempts: true },
    });
    const d = decyzja(wiersz as WierszZdarzenia | null, teraz);
    if (d.rodzaj !== 'przejmij') return d;

    // Przejęcie warunkowe: `updateMany` ze statusem w WHERE. Gdyby między
    // odczytem a zapisem ktoś inny przejął ten sam wiersz, zaktualizuje się
    // zero wierszy i my ustępujemy. Bez tego dwa procesy mogłyby uruchomić
    // handler równolegle na tym samym zdarzeniu.
    const { count } = await this.prisma.stripeWebhookEvent.updateMany({
      where: {
        eventId: event.id,
        status: wiersz?.status,
        ...(wiersz?.claimedAt ? { claimedAt: wiersz.claimedAt } : {}),
      },
      data: {
        status: 'PENDING',
        attempts: { increment: 1 },
        claimedAt: teraz,
        nextAttemptAt: null,
        payload: event as unknown as Prisma.InputJsonValue,
        payloadPurgedAt: null,
      },
    });
    if (count === 0) return { rodzaj: 'wTrakcie' };

    this.logger.warn(
      `Przejmuję zdarzenie Stripe ${event.id} (${d.powod}), próba ${(wiersz?.attempts ?? 0) + 1}`,
    );
    return d;
  }

  /** Uruchamia handler i zapisuje wynik. Rzuca dalej, żeby Stripe dostał 5xx. */
  private async uruchomHandler(event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  }) {
    try {
      await this.rozdzielZdarzenie(event);
    } catch (err) {
      await this.oznaczNieudane(event.id, err);
      throw err;
    }
    await this.zakonczZdarzenie(event.id);
    return { received: true };
  }

  private async zakonczZdarzenie(eventId: string): Promise<void> {
    await this.prisma.stripeWebhookEvent.update({
      where: { eventId },
      data: {
        status: 'PROCESSED',
        processedAt: new Date(),
        lastError: null,
        nextAttemptAt: null,
        claimedAt: null,
      },
    });
  }

  private async oznaczNieudane(eventId: string, err: unknown): Promise<void> {
    const wiersz = await this.prisma.stripeWebhookEvent.findUnique({
      where: { eventId },
      select: { attempts: true },
    });
    const proba = wiersz?.attempts ?? 1;
    const komunikat = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    this.logger.error(
      `Handler webhooka Stripe padł dla ${eventId} (próba ${proba}): ${komunikat}`,
    );
    // Zapis stanu nie może przesłonić pierwotnego błędu — jeżeli padnie i on,
    // zostaje wiersz PENDING, który po wygaśnięciu dzierżawy podejmie scheduler.
    try {
      await this.prisma.stripeWebhookEvent.update({
        where: { eventId },
        data: {
          status: 'FAILED',
          lastError: komunikat.slice(0, 4000),
          nextAttemptAt: nastepnaProba(proba, new Date()),
          claimedAt: null,
        },
      });
    } catch (zapis) {
      this.logger.error(
        `Nie udało się zapisać stanu FAILED dla ${eventId}: ${
          zapis instanceof Error ? zapis.message : String(zapis)
        }`,
      );
    }
  }

  /**
   * Ponowne przetworzenie zdarzenia z zapisanej treści — używane przez
   * scheduler ponowień i przez ręczne „ponów" w panelu admina.
   */
  async przetworzPonownie(eventId: string): Promise<{ eventId: string; status: string }> {
    const wiersz = await this.prisma.stripeWebhookEvent.findUnique({ where: { eventId } });
    if (!wiersz) throw new NotFoundException(`Nie ma zdarzenia ${eventId}`);
    if (wiersz.status === 'PROCESSED') {
      return { eventId, status: 'PROCESSED' };
    }
    if (!wiersz.payload) {
      throw new BadRequestException(
        `Zdarzenie ${eventId} nie ma zapisanej treści — nie da się go ponowić. ` +
          `Treść jest czyszczona po ${DNI_PRZECHOWANIA_TRESCI} dniach od przetworzenia, ` +
          `a zdarzenia sprzed 2026-08-22 nigdy jej nie miały.`,
      );
    }

    const teraz = new Date();
    const { count } = await this.prisma.stripeWebhookEvent.updateMany({
      where: { eventId, status: wiersz.status },
      data: { status: 'PENDING', attempts: { increment: 1 }, claimedAt: teraz, nextAttemptAt: null },
    });
    if (count === 0) {
      throw new ConflictException(`Zdarzenie ${eventId} zostało w międzyczasie przejęte`);
    }

    const event = wiersz.payload as unknown as {
      id: string;
      type: string;
      data: { object: Record<string, unknown> };
    };
    try {
      await this.rozdzielZdarzenie(event);
    } catch (err) {
      await this.oznaczNieudane(eventId, err);
      throw err;
    }
    await this.zakonczZdarzenie(eventId);
    return { eventId, status: 'PROCESSED' };
  }

  private async rozdzielZdarzenie(event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  }) {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutCompleted(event);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpsert(event);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event);
        break;
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.payment_succeeded':
      case 'invoice.paid':
        await this.handleInvoicePaid(event);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event);
        break;
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event);
        break;
      default:
        this.logger.debug(`Ignoring unhandled Stripe event: ${event.type}`);
    }
  }

  private async handleCheckoutCompleted(event: { id: string; data: { object: Record<string, unknown> } }) {
    const session = event.data.object as {
      id?: string;
      payment_status?: string;
      amount_total?: number;
      currency?: string;
      client_reference_id?: string;
      metadata?: Record<string, string> | null;
      payment_intent?: string;
    };

    if (session.payment_status !== 'paid') {
      this.logger.warn(`Ignoring session ${session.id} — payment_status=${session.payment_status}`);
      return;
    }

    const userId = session.client_reference_id ?? session.metadata?.userId;
    const kind = session.metadata?.kind ?? 'wallet_topup';
    if (!userId) {
      this.logger.error(`Missing client_reference_id on session ${session.id}; cannot credit wallet`);
      return;
    }
    if (kind !== 'wallet_topup') {
      this.logger.debug(`Ignoring non-topup checkout (kind=${kind}) for ${session.id}`);
      return;
    }

    const amountMajor = (session.amount_total ?? 0) / 100;
    if (amountMajor <= 0) {
      this.logger.warn(`Ignoring zero-amount session ${session.id}`);
      return;
    }

    const idempotencyKey = `stripe:checkout:${session.id}`;
    const tx = await this.ledger.credit({
      userId,
      amount: amountMajor,
      type: WalletTxType.TOPUP,
      description: `Doładowanie Stripe (${session.id})`,
      idempotencyKey,
      paymentProvider: 'STRIPE',
      paymentRef: session.payment_intent ?? session.id,
    });

    await this.audit.record({
      action: 'WALLET_TOPUP_COMPLETED',
      userId,
      details: {
        walletTxId: tx.id,
        sessionId: session.id,
        amount: amountMajor.toFixed(2),
        idempotent: idempotencyKey === tx.idempotencyKey,
      },
    });

    // Optional percent-bonus applied at checkout time. Stripe metadata
    // contains the canonicalized bonus amount we calculated server-side
    // before redirecting the user to Stripe — so the user can't tamper
    // with the percentage by editing client-side state.
    const promoCodeId = session.metadata?.promoCodeId;
    const bonusAmountStr = session.metadata?.bonusAmount;
    if (promoCodeId && bonusAmountStr) {
      try {
        await this.promo.applyPercentBonusForTopup({
          userId,
          promoCodeId,
          bonusAmount: bonusAmountStr,
          relatedWalletTxId: tx.id,
          sessionId: session.id ?? '',
        });
      } catch (err) {
        // Topup itself succeeded — bonus failure must not roll back the
        // top-up. Operator follow-up via audit log + Slack alert.
        this.logger.error(
          `applyPercentBonusForTopup failed for sessionId=${session.id} user=${userId}: ${
            (err as Error).message
          }`,
        );
        await this.audit.record({
          action: 'PROMO_PERCENT_BONUS_FAILED',
          userId,
          details: {
            sessionId: session.id,
            promoCodeId,
            bonusAmount: bonusAmountStr,
            error: (err as Error).message,
          },
        });
      }
    }

    void this.notifyWalletTopupOk({
      userId,
      amountMajor: amountMajor.toFixed(2),
    }).catch((err) => {
      this.logger.warn(
        `handleCheckoutCompleted: topup mail failed user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    void this.ecoPoints.safeAward(`wallet_topup:${tx.id}`, async () => {
      const pts = await this.ecoPoints.awardWalletTopup(this.prisma, {
        userId,
        amountMajor,
        walletTxId: tx.id,
      });
      if (pts > 0) {
        this.logger.log(`EKO +${pts} WALLET_TOPUP user=${userId} tx=${tx.id}`);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Stripe Subscription webhooks (C-7)
  // ---------------------------------------------------------------------------

  private async handleSubscriptionUpsert(event: {
    type: string;
    data: { object: Record<string, unknown> };
  }) {
    const stripeSub = event.data.object as unknown as StripeSubscription;
    if (!stripeSub.id) {
      this.logger.warn(`Ignoring malformed ${event.type} payload (missing id)`);
      return;
    }

    // Basil+ moved billing periods to `items.data[i]`. The helper falls back
    // to root `current_period_*` for cross-version compatibility — the only
    // way to truly fail here is if Stripe sent a payload with neither, which
    // means malformed event we can't process.
    let period: { start: number; end: number };
    try {
      period = getSubscriptionPeriod(stripeSub);
    } catch (err) {
      this.logger.warn(
        `Ignoring ${event.type} for ${stripeSub.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const updated = await this.subscriptions.syncFromStripeSubscriptionEvent({
      id: stripeSub.id,
      status: stripeSub.status,
      current_period_start: period.start,
      current_period_end: period.end,
      cancel_at_period_end: stripeSub.cancel_at_period_end,
      metadata: stripeSub.metadata ?? null,
    });
    if (!updated) {
      this.logger.debug(
        `${event.type} for unknown subscription stripe=${stripeSub.id} — ignoring`,
      );
    }
  }

  private async handleSubscriptionDeleted(event: {
    data: { object: Record<string, unknown> };
  }) {
    const stripeSub = event.data.object as unknown as StripeSubscription;
    if (!stripeSub.id) return;
    await this.subscriptions.markCanceledFromStripe({
      stripeSubscriptionId: stripeSub.id,
      metadataSubscriptionId: stripeSub.metadata?.verrisSubscriptionId ?? null,
    });
  }

  private async handleInvoicePaid(event: {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  }) {
    const invoice = event.data.object as unknown as StripeInvoice;
    if (!invoice.id) return;

    // Basil+ removed `invoice.subscription`; the link now lives in
    // `invoice.parent.subscription_details.subscription`. Helper handles
    // both shapes for transitional periods.
    const subscriptionId = getInvoiceSubscriptionId(invoice);

    // Subscription metadata is what links a Stripe invoice back to our row;
    // it's set in `SubscriptionsService.startStripeRecurring`. Some invoice
    // events (`invoice.created` for the first cycle) don't echo subscription
    // metadata directly — rely on `subscription` field + on-file mapping.
    const verrisSubscriptionId = invoice.metadata?.verrisSubscriptionId ?? null;
    let verrisUserId = invoice.metadata?.verrisUserId ?? null;
    let localSubscription: { id: string; userId: string } | null = null;

    if (subscriptionId) {
      const sub = await this.subscriptions.findByStripeSubscriptionId(
        subscriptionId,
        verrisSubscriptionId,
      );
      if (sub) {
        localSubscription = { id: sub.id, userId: sub.userId };
        verrisUserId = verrisUserId ?? sub.userId;
      }
    }

    if (!verrisUserId && invoice.customer) {
      const userByCustomer = await this.prisma.user.findUnique({
        where: { stripeCustomerId: invoice.customer },
        select: { id: true },
      });
      if (userByCustomer) verrisUserId = userByCustomer.id;
    }

    if (!verrisUserId) {
      this.logger.warn(
        `${event.type}: cannot map invoice=${invoice.id} to a local user — skipping`,
      );
      return;
    }

    const { invoice: row, created } = await this.invoices.upsertFromStripe(invoice, {
      verrisUserId,
      verrisSubscriptionId: localSubscription?.id ?? verrisSubscriptionId ?? null,
    });

    // Activate the subscription only when the invoice is actually paid.
    if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
      if (subscriptionId) {
        await this.subscriptions.activateAfterStripePayment({
          stripeSubscriptionId: subscriptionId,
          metadataSubscriptionId: verrisSubscriptionId,
          periodStart: invoice.status_transitions?.paid_at
            ? new Date(invoice.status_transitions.paid_at * 1000)
            : undefined,
          stripeInvoiceId: invoice.id,
        });
      }
      if (created || invoice.status === 'paid') {
        await this.audit.record({
          action: 'INVOICE_PAID',
          userId: verrisUserId,
          details: {
            invoiceId: row.id,
            stripeInvoiceId: invoice.id,
            amount: row.amount.toFixed(2),
            currency: row.currency,
            stripeSubscriptionId: subscriptionId ?? null,
          },
        });

        // Notify the customer that their subscription has been renewed.
        // Failure to email is logged but never fails the webhook — Stripe
        // retries on non-2xx and we don't want a transient SMTP error to
        // duplicate the activation.
        void this.notifySubscriptionRenewed({
          userId: verrisUserId,
          localSubscriptionId: localSubscription?.id ?? null,
          stripeInvoice: invoice,
        }).catch((err) => {
          this.logger.warn(
            `notifySubscriptionRenewed failed for invoice=${invoice.id}: ${
              (err as Error).message
            }`,
          );
        });
      }
    }
  }

  private async handleInvoicePaymentFailed(event: {
    id: string;
    data: { object: Record<string, unknown> };
  }) {
    const invoice = event.data.object as unknown as StripeInvoice;
    if (!invoice.id) return;

    const subscriptionId = getInvoiceSubscriptionId(invoice);
    if (!subscriptionId) {
      this.logger.warn(
        `invoice.payment_failed without subscription on invoice=${invoice.id} — ignoring`,
      );
      return;
    }

    const verrisSubscriptionId = invoice.metadata?.verrisSubscriptionId ?? null;

    // Mirror the row even on failure so the customer sees the OPEN invoice in
    // the UI. We only need to look up the user — fall back to the customer.
    let verrisUserId = invoice.metadata?.verrisUserId ?? null;
    if (!verrisUserId && invoice.customer) {
      const userByCustomer = await this.prisma.user.findUnique({
        where: { stripeCustomerId: invoice.customer },
        select: { id: true },
      });
      if (userByCustomer) verrisUserId = userByCustomer.id;
    }
    if (!verrisUserId) {
      const sub = await this.subscriptions.findByStripeSubscriptionId(
        subscriptionId,
        verrisSubscriptionId,
      );
      if (sub) verrisUserId = sub.userId;
    }

    if (verrisUserId) {
      await this.invoices.upsertFromStripe(invoice, {
        verrisUserId,
        verrisSubscriptionId,
      });
    }

    if (verrisUserId) {
      void this.notifySubscriptionPaymentFailed({
        userId: verrisUserId,
        stripeInvoice: invoice,
      }).catch((err) => {
        this.logger.warn(
          `notifySubscriptionPaymentFailed failed for invoice=${invoice.id}: ${
            (err as Error).message
          }`,
        );
      });
    }

    await this.subscriptions.markPastDueFromStripe({
      stripeSubscriptionId: subscriptionId,
      metadataSubscriptionId: verrisSubscriptionId,
      reason: `stripe:invoice:${invoice.id}:payment_failed`,
    });
  }

  /**
   * Stripe `payment_intent.succeeded` — C-9 off-session wallet auto top-up.
   */
  private async handlePaymentIntentSucceeded(event: {
    id: string;
    data: { object: Record<string, unknown> };
  }): Promise<void> {
    const pi = event.data.object as {
      id?: string;
      metadata?: Record<string, string | undefined>;
      amount_received?: number;
    };
    const meta = pi.metadata ?? {};
    if (meta.verris_kind !== 'wallet_auto_topup' || !meta.verris_user_id) {
      return;
    }

    const userId = meta.verris_user_id;
    const amtMajor = ((pi.amount_received ?? 0) as number) / 100;
    if (amtMajor <= 0 || !pi.id) return;

    // Audit F-16: only bump the statistics when this delivery actually moved
    // money (a replayed webhook returns the existing ledger entry).
    const alreadyCredited = await this.ledger.findByIdempotencyKey(`stripe:pi:${pi.id}`);

    const tx = await this.ledger.credit({
      userId,
      amount: amtMajor,
      type: WalletTxType.TOPUP,
      description: `Auto-doładowanie portfela (PaymentIntent ${pi.id})`,
      idempotencyKey: `stripe:pi:${pi.id}`,
      paymentProvider: 'STRIPE',
      paymentRef: pi.id,
      metadata: { channel: 'wallet_auto_topup' },
    });

    if (!alreadyCredited) {
      await this.prisma.walletAutoTopup.updateMany({
        where: { userId },
        data: {
          totalToppedUpAmount: { increment: amtMajor },
          totalToppedUpCount: { increment: 1 },
          lastAttemptOk: true,
          lastAttemptError: null,
        },
      });
    }

    await this.audit.record({
      action: 'WALLET_AUTOTOPUP_SUCCEEDED',
      userId,
      details: { walletTxId: tx.id, paymentIntentId: pi.id, amount: amtMajor.toFixed(2) },
    });

    void this.notifyWalletAutoTopupOk({
      userId,
      amountMajor: amtMajor.toFixed(2),
    }).catch((err) => {
      this.logger.warn(
        `handlePaymentIntentSucceeded: autotopup mail failed user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    if (!alreadyCredited) {
      void this.ecoPoints.safeAward(`wallet_autotopup:${tx.id}`, async () => {
        const pts = await this.ecoPoints.awardWalletTopup(this.prisma, {
          userId,
          amountMajor: amtMajor,
          walletTxId: tx.id,
        });
        if (pts > 0) {
          this.logger.log(`EKO +${pts} WALLET_TOPUP (auto) user=${userId} tx=${tx.id}`);
        }
      });
    }
  }

  private async handlePaymentIntentFailed(event: {
    data: { object: Record<string, unknown> };
  }): Promise<void> {
    const pi = event.data.object as {
      id?: string;
      metadata?: Record<string, string | undefined>;
      last_payment_error?: { message?: string };
    };
    const meta = pi.metadata ?? {};
    if (meta.verris_kind !== 'wallet_auto_topup' || !meta.verris_user_id) {
      return;
    }

    await this.prisma.walletAutoTopup.updateMany({
      where: { userId: meta.verris_user_id },
      data: {
        lastAttemptAt: new Date(),
        lastAttemptOk: false,
        lastAttemptError: (pi.last_payment_error?.message ?? 'payment_failed').slice(0, 2000),
      },
    });

    const userId = meta.verris_user_id;
    await this.audit.record({
      action: 'WALLET_AUTOTOPUP_PAYMENT_FAILED',
      userId,
      details: {
        paymentIntentId: pi.id ?? null,
        error: pi.last_payment_error?.message ?? null,
      },
    });

    void this.notifyWalletAutoTopupFailed({
      userId,
      reason: pi.last_payment_error?.message ?? 'payment_failed',
    }).catch((err) => {
      this.logger.warn(
        `handlePaymentIntentFailed: autotopup fail mail user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Email notifications (Sprint 2.1)
  // ---------------------------------------------------------------------------

  private panelUrl(): string {
    return (
      this.config.get<string>('CLIENT_PANEL_URL') ??
      this.config.get<string>('clientPanelUrl') ??
      'https://panel.verris.pl'
    ).replace(/\/$/, '');
  }

  private async notifyWalletTopupOk(opts: {
    userId: string;
    amountMajor: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, firstName: true, walletBalance: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return;
    const panelUrl = this.panelUrl();
    const message = walletTopupOkTemplate({
      to: user.email,
      firstName: user.firstName,
      amountPln: opts.amountMajor,
      newBalancePln: new Prisma.Decimal(user.walletBalance).toFixed(2),
      panelUrl,
    });
    await this.mailer.send({
      ...message,
      userId: opts.userId,
      category: 'TRANSACTIONAL',
      fromRole: 'BILLING',
    });
  }

  private async notifyWalletAutoTopupOk(opts: {
    userId: string;
    amountMajor: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, firstName: true, walletBalance: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return;
    const panelUrl = this.panelUrl();
    const message = walletAutoTopupOkTemplate({
      to: user.email,
      firstName: user.firstName,
      amountPln: opts.amountMajor,
      newBalancePln: new Prisma.Decimal(user.walletBalance).toFixed(2),
      panelUrl,
    });
    await this.mailer.send({
      ...message,
      userId: opts.userId,
      category: 'TRANSACTIONAL',
      fromRole: 'BILLING',
    });
  }

  private async notifyWalletAutoTopupFailed(opts: {
    userId: string;
    reason: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: {
        email: true,
        firstName: true,
        anonymizedAt: true,
        walletAutoTopup: { select: { topupAmount: true } },
      },
    });
    if (!user || user.anonymizedAt || !user.email) return;
    const panelUrl = this.panelUrl();
    const topupAmount = user.walletAutoTopup?.topupAmount?.toFixed(2) ?? '—';
    const message = walletAutoTopupFailedTemplate({
      to: user.email,
      firstName: user.firstName,
      reason: opts.reason,
      topupAmountPln: topupAmount,
      panelUrl,
    });
    await this.mailer.send({
      ...message,
      userId: opts.userId,
      category: 'TRANSACTIONAL',
      fromRole: 'BILLING',
    });
  }

  private async notifySubscriptionRenewed(opts: {
    userId: string;
    localSubscriptionId: string | null;
    stripeInvoice: StripeInvoice;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, firstName: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return;

    let serviceName = 'Hosting Verris';
    let newPeriodEnd: Date = opts.stripeInvoice.status_transitions?.paid_at
      ? new Date(opts.stripeInvoice.status_transitions.paid_at * 1000)
      : new Date();

    if (opts.localSubscriptionId) {
      const sub = await this.prisma.subscription.findUnique({
        where: { id: opts.localSubscriptionId },
        select: {
          currentPeriodEnd: true,
          plan: { select: { name: true } },
          account: { select: { domain: true } },
        },
      });
      if (sub) {
        if (sub.currentPeriodEnd) newPeriodEnd = sub.currentPeriodEnd;
        const planName = sub.plan?.name ?? 'Hosting Verris';
        serviceName = sub.account?.domain ? `${planName} (${sub.account.domain})` : planName;
      }
    }

    const amount = ((opts.stripeInvoice.amount_paid ?? opts.stripeInvoice.total ?? 0) / 100).toFixed(
      2,
    );
    const currency = (opts.stripeInvoice.currency ?? 'pln').toUpperCase() as
      | 'PLN'
      | 'EUR'
      | 'USD';

    const ourInvoice = opts.stripeInvoice.id
      ? await this.prisma.invoice.findFirst({
          where: { provider: 'STRIPE', providerRef: opts.stripeInvoice.id },
          select: { id: true, number: true },
        })
      : null;

    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';

    const message = subscriptionRenewedTemplate({
      to: user.email,
      firstName: user.firstName,
      serviceName,
      amount,
      currency,
      paidAt: opts.stripeInvoice.status_transitions?.paid_at
        ? new Date(opts.stripeInvoice.status_transitions.paid_at * 1000)
        : new Date(),
      newPeriodEnd,
      invoiceNumber: ourInvoice?.number ?? null,
      invoiceUrl: ourInvoice?.id
        ? `${panelUrl}/dashboard/billing/invoices/${ourInvoice.id}`
        : null,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
  }

  private async notifySubscriptionPaymentFailed(opts: {
    userId: string;
    stripeInvoice: StripeInvoice;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { email: true, firstName: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return;

    const subscriptionId = getInvoiceSubscriptionId(opts.stripeInvoice);
    let serviceName = 'Hosting Verris';
    let suspendAt: Date | null = null;
    if (subscriptionId) {
      const localSub = await this.prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        select: {
          plan: { select: { name: true } },
          account: { select: { domain: true } },
          currentPeriodEnd: true,
        },
      });
      if (localSub) {
        const planName = localSub.plan?.name ?? 'Hosting Verris';
        serviceName = localSub.account?.domain
          ? `${planName} (${localSub.account.domain})`
          : planName;
        // Stripe Smart Retries typically run 3 attempts over ~3 weeks; we
        // suspend ~7 days after the last retry. We don't know the exact
        // day from the payload — use period end + 14 days as conservative
        // upper bound for the customer-facing communication.
        if (localSub.currentPeriodEnd) {
          suspendAt = new Date(localSub.currentPeriodEnd.getTime() + 14 * 24 * 60 * 60 * 1000);
        }
      }
    }

    const amount = (
      (opts.stripeInvoice.amount_due ?? opts.stripeInvoice.total ?? 0) / 100
    ).toFixed(2);
    const currency = (opts.stripeInvoice.currency ?? 'pln').toUpperCase() as
      | 'PLN'
      | 'EUR'
      | 'USD';

    const nextRetryAt = opts.stripeInvoice.next_payment_attempt
      ? new Date(opts.stripeInvoice.next_payment_attempt * 1000)
      : null;
    const errorReason =
      opts.stripeInvoice.last_finalization_error?.message ??
      opts.stripeInvoice.last_payment_error?.message ??
      null;

    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const paymentUpdateUrl =
      opts.stripeInvoice.hosted_invoice_url ?? `${panelUrl}/dashboard/billing`;

    const message = subscriptionPaymentFailedTemplate({
      to: user.email,
      firstName: user.firstName,
      serviceName,
      amount,
      currency,
      errorReason,
      nextRetryAt,
      suspendAt,
      paymentUpdateUrl,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
  }
}
