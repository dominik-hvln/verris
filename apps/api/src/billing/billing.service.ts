import {
  BadRequestException,
  ConflictException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { Prisma, WalletTransaction, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { WalletLedgerService } from './wallet-ledger.service.js';
import { DoladowanieService, type WalutaWplaty } from './doladowanie.service.js';
import { StripeService } from './stripe/stripe.service.js';
import {
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
  StripeInvoice,
  StripeSubscription,
} from './stripe/stripe.client.js';
import { InvoicesService } from './invoices.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { adminCreditNotificationTemplate } from '../mail/templates/admin-credit-notification.js';
import {
  subscriptionPaymentFailedTemplate,
  subscriptionRenewedTemplate,
  walletAutoTopupFailedTemplate,
  walletAutoTopupOkTemplate,
  walletTopupOkTemplate,
} from '../mail/templates/billing-lifecycle-notifications.js';
import { rowsToCsv } from './csv.util.js';
import { PromoService } from './promo.service.js';
import { EcoPointsService } from '../eco/eco-points.service.js';
import {
  Decyzja,
  decyzja,
  DNI_PRZECHOWANIA_TRESCI,
  nastepnaProba,
  WierszZdarzenia,
} from './stripe/webhook-ewidencja.js';
import {
  czyStatusPaynow,
  PAYNOW_SANDBOX_URL,
  PaynowBlad,
  PaynowClient,
  poprawnyPodpisPowiadomienia,
  type StatusPlatnosciPaynow,
} from './paynow/paynow.client.js';

/** Bramka doładowania wybrana w panelu klienta. Bez wyboru: Paynow dla PLN (gdy skonfigurowany), inaczej Stripe. */
export type MetodaDoladowania = 'paynow' | 'stripe';

type RekordPaynow = {
  id: string;
  userId: string;
  kwotaMinor: number;
  waluta: string;
  paymentId: string | null;
  status: string;
  meta: Prisma.JsonValue;
};

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
    private readonly doladowanie: DoladowanieService,
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
      // 2026-10-05 — czy formularz doładowania ma pokazać Paynow (BLIK, przelew, karta) jako domyślną bramkę dla PLN.
      paynowDostepny: this.paynowKlient() !== null,
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

  /** M-27 — link do Stripe Checkout (tryb setup), w którym klient zapisuje kartę bez zakupu. */
  async startAddCard(userId: string): Promise<{ url: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, companyName: true, stripeCustomerId: true },
    });
    if (!user) throw new NotFoundException('Użytkownik nie istnieje.');
    const customerId = await this.subscriptions.ensureStripeCustomer(user);
    const panel = (this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl').replace(/\/$/, '');
    const session = await this.stripe.createSetupSession({
      customerId,
      successUrl: `${panel}/dashboard/billing?karta=dodana`,
      cancelUrl: `${panel}/dashboard/billing`,
      metadata: { userId, kind: 'add_card' },
    });
    await this.audit.record({ action: 'PAYMENT_METHOD_ADD_STARTED', userId, actorUserId: userId, details: { sessionId: session.id } });
    if (!session.url) throw new BadRequestException('Operator płatności nie zwrócił adresu formularza — spróbuj ponownie.');
    return { url: session.url };
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

  /**
   * M-26 — klient usuwa zapisaną kartę. Najpierw odpinamy ją w Stripe (żeby nie
   * dało się jej już obciążyć), potem sprzątamy wiersz, kartę domyślną i
   * auto-doładowanie, które na nią wskazywało.
   */
  async deleteMyPaymentMethod(userId: string, id: string) {
    const pm = await this.prisma.paymentMethod.findFirst({ where: { id, userId } });
    if (!pm) throw new NotFoundException('Nie znaleziono tej karty.');
    if (pm.provider === 'STRIPE' && pm.providerRef.startsWith('pm_')) {
      try {
        await this.stripe.detachPaymentMethod(pm.providerRef);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Już odpięta / nie istnieje w Stripe — cel osiągnięty, sprzątamy u siebie.
        if (!/not attached|no such paymentmethod|resource_missing/i.test(msg)) {
          this.logger.warn(`detachPaymentMethod user=${userId} pm=${pm.id}: ${msg}`);
          throw new BadRequestException('Operator płatności nie potwierdził usunięcia karty — spróbuj ponownie za chwilę.');
        }
      }
    }
    await this.prisma.$transaction([
      this.prisma.paymentMethod.delete({ where: { id: pm.id } }),
      this.prisma.user.updateMany({
        where: { id: userId, defaultPaymentMethodId: pm.providerRef },
        data: { defaultPaymentMethodId: null },
      }),
      this.prisma.walletAutoTopup.updateMany({
        where: { userId, paymentMethodId: pm.id },
        data: { paymentMethodId: null },
      }),
    ]);
    await this.audit.record({
      action: 'PAYMENT_METHOD_REMOVED',
      userId,
      actorUserId: userId,
      details: { paymentMethodId: pm.id, brand: pm.brand, last4: pm.last4 },
    });
    return { ok: true as const };
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
    /** M-10 — waluta wpłaty; portfel i tak liczy w K (kurs NBP przy księgowaniu). */
    currency?: WalutaWplaty | null;
    /** 2026-10-05 — bramka; bez wyboru PLN idzie przez Paynow, gdy jest skonfigurowany. */
    metoda?: MetodaDoladowania | null;
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
    const waluta: WalutaWplaty = opts.currency ?? 'PLN';
    const paynow = this.paynowKlient();
    // Paynow: tylko PLN (EUR/USD u Paynow wyłącznie kartą i po osobnej umowie — zostają w Stripe).
    const przezPaynow = paynow !== null && waluta === 'PLN' && opts.metoda !== 'stripe';
    if (opts.metoda === 'paynow' && !przezPaynow) {
      throw new BadRequestException(
        paynow === null
          ? 'Płatności Paynow nie są jeszcze włączone — wybierz płatność kartą.'
          : 'Paynow przyjmuje wpłaty tylko w PLN — dla EUR i USD wybierz płatność kartą.',
      );
    }
    // https://docs.paynow.pl/docs/reference/v3/send-payment-request — amount >= 100 (1,00 zł).
    if (przezPaynow && minor < 100) {
      throw new BadRequestException('Minimalna kwota płatności przez Paynow to 1 zł.');
    }
    // M-09 — stawka ustalana TERAZ (VIES, próg OSS) i zapisywana w metadanych płatności.
    const { traktowanie, vies } = await this.doladowanie.ustalTraktowanie(user.id);

    const description = promoMetadata
      ? `Doładowanie portfela Verris (${amount.toFixed(2)} ${user.walletCurrency}) + ${promoMetadata.promoPercent}% bonus „${promoMetadata.promoCode}"`
      : `Doładowanie portfela Verris (${amount.toFixed(2)} ${user.walletCurrency})`;
    const bonus = promoMetadata
      ? { amount: promoMetadata.bonusAmount, percent: Number(promoMetadata.promoPercent), code: promoMetadata.promoCode }
      : null;

    if (przezPaynow) {
      return this.utworzDoladowaniePaynow(paynow, {
        user,
        minor,
        description,
        meta: { kind: 'wallet_topup', ...(promoMetadata ?? {}), ...DoladowanieService.doMetadanych(traktowanie, vies) },
        amount,
        bonus,
      });
    }

    const session = await this.stripe.createCheckoutSession({
      amountMinor: minor,
      currency: waluta,
      customerEmail: user.email,
      successUrl: this.config.get<string>('stripeSuccessUrl')!,
      cancelUrl: this.config.get<string>('stripeCancelUrl')!,
      clientReferenceId: user.id,
      metadata: {
        userId: user.id,
        kind: 'wallet_topup',
        ...(promoMetadata ?? {}),
        ...DoladowanieService.doMetadanych(traktowanie, vies),
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
      bonus,
    };
  }

  // ---------------------------------------------------------------------------
  // Paynow (mBank): doładowanie portfela w PLN — główna bramka płatności jednorazowych (2026-10-05)
  // ---------------------------------------------------------------------------

  /** Klient Paynow albo `null`, gdy brak PAYNOW_API_KEY / PAYNOW_SIGNATURE_KEY (wtedy wszystko idzie przez Stripe). */
  private paynowKlient(): PaynowClient | null {
    const apiKey = this.config.get<string>('paynowApiKey');
    const signatureKey = this.config.get<string>('paynowSignatureKey');
    if (!apiKey || !signatureKey) return null;
    return new PaynowClient(apiKey, signatureKey, this.config.get<string>('paynowApiUrl') ?? PAYNOW_SANDBOX_URL);
  }

  private async utworzDoladowaniePaynow(
    paynow: PaynowClient,
    i: {
      user: { id: string; email: string; walletCurrency: string };
      minor: number;
      description: string;
      meta: Record<string, string>;
      amount: Prisma.Decimal;
      bonus: { amount: string; percent: number; code: string } | null;
    },
  ) {
    // Rekord przed wywołaniem Paynow: jego id to externalId i Idempotency-Key tego zlecenia.
    const rek = await this.prisma.paynowPlatnosc.create({
      data: { userId: i.user.id, kwotaMinor: i.minor, waluta: 'PLN', meta: i.meta },
    });
    const panel = (this.config.get<string>('clientPanelUrl') ?? 'https://panel.verris.pl').replace(/\/$/, '');
    let odp: Awaited<ReturnType<PaynowClient['utworzPlatnosc']>>;
    try {
      // https://docs.paynow.pl/docs/v3/payments#make-a-payment — kwota w groszach, externalId = nasz rekord,
      // continueUrl nadpisuje adres powrotu z konfiguracji sklepu (Paynow dopisze paymentId i paymentStatus).
      odp = await paynow.utworzPlatnosc(
        {
          amount: i.minor,
          currency: 'PLN',
          externalId: rek.id,
          description: i.description.slice(0, 255),
          continueUrl: `${panel}/dashboard/billing?paynow=${rek.id}`,
          buyer: { email: i.user.email },
        },
        rek.id,
      );
    } catch (err) {
      await this.prisma.paynowPlatnosc.update({ where: { id: rek.id }, data: { status: 'ERROR' } });
      this.logger.error(`Paynow: nie utworzono płatności ${rek.id} user=${i.user.id}: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException('Operator płatności nie przyjął zlecenia — spróbuj ponownie za chwilę.');
    }
    if (!odp.redirectUrl || !odp.paymentId) {
      await this.prisma.paynowPlatnosc.update({ where: { id: rek.id }, data: { status: 'ERROR', paymentId: odp.paymentId ?? null } });
      throw new BadRequestException('Operator płatności nie zwrócił adresu płatności — spróbuj ponownie.');
    }
    await this.prisma.paynowPlatnosc.update({
      where: { id: rek.id },
      data: { paymentId: odp.paymentId, ...(czyStatusPaynow(odp.status) ? { status: odp.status } : {}) },
    });
    await this.audit.record({
      action: 'WALLET_TOPUP_INITIATED',
      userId: i.user.id,
      details: {
        provider: 'PAYNOW',
        paynowId: rek.id,
        paymentId: odp.paymentId,
        amount: i.amount.toFixed(2),
        currency: i.user.walletCurrency,
        ...(i.bonus ? { promoCode: i.bonus.code, bonusAmount: i.bonus.amount } : {}),
      },
    });
    return { url: odp.redirectUrl, sessionId: rek.id, bonus: i.bonus };
  }

  /**
   * Powiadomienie Paynow o zmianie statusu płatności.
   * https://docs.paynow.pl/docs/v3/integration#notifications — podpis HMAC z surowej treści; to samo
   * powiadomienie może przyjść kilka razy i nie po kolei. Odpowiedź 200 bez treści; wyjątek (5xx) każe
   * Paynow ponowić wg harmonogramu (do 48 h), a niedoręczone powiadomienie łapie {@link sprawdzPlatnoscPaynow}.
   */
  async handlePaynowNotification(surowaTresc: Buffer, podpis: string | undefined): Promise<void> {
    const signatureKey = this.config.get<string>('paynowSignatureKey');
    if (!signatureKey || !this.paynowKlient()) throw new ServiceUnavailableException('Paynow nie jest skonfigurowany');
    if (!poprawnyPodpisPowiadomienia(signatureKey, surowaTresc, podpis)) {
      this.logger.warn('Paynow: odrzucono powiadomienie z niepoprawnym podpisem');
      throw new UnauthorizedException('Niepoprawny podpis powiadomienia');
    }
    let n: { paymentId?: unknown; externalId?: unknown; status?: unknown };
    try {
      n = JSON.parse(surowaTresc.toString('utf8'));
    } catch {
      throw new BadRequestException('Niepoprawna treść powiadomienia');
    }
    if (typeof n.paymentId !== 'string' || typeof n.externalId !== 'string' || !czyStatusPaynow(n.status)) {
      throw new BadRequestException('Niepełne powiadomienie Paynow');
    }
    const rek = await this.prisma.paynowPlatnosc.findUnique({ where: { id: n.externalId } });
    if (!rek) {
      // Nie nasze zlecenie (np. inny sklep na tym samym koncie) — potwierdzamy odbiór, nic nie księgujemy.
      this.logger.warn(`Paynow: powiadomienie dla nieznanego externalId=${n.externalId} (${n.paymentId})`);
      return;
    }
    if (rek.paymentId !== n.paymentId) {
      // Powiadomienie podpisane, ale o innej płatności niż ta, którą utworzyliśmy dla tego doładowania
      // (np. ponowienie płatności po stronie Paynow — opcja „ABANDONED” w panelu Paynow). Kwoty tej płatności
      // nie da się potwierdzić (powiadomienie i status nie zawierają kwoty), więc nie księgujemy automatycznie.
      await this.zglosNiezgodnoscPaynow(rek, n.paymentId, n.status);
      return;
    }
    await this.zastosujStatusPaynow(rek, n.status);
  }

  /**
   * Zapasowe sprawdzenie statusu po powrocie klienta z Paynow (continueUrl), gdy powiadomienie
   * jeszcze nie dotarło. Ta sama funkcja księgowania i ten sam klucz idempotencji co powiadomienie.
   * https://docs.paynow.pl/docs/reference/v3/get-payment-status
   */
  async sprawdzPlatnoscPaynow(userId: string, id: string): Promise<{ status: string }> {
    const rek = await this.prisma.paynowPlatnosc.findFirst({ where: { id, userId } });
    if (!rek) throw new NotFoundException('Nie znaleziono tej płatności.');
    const paynow = this.paynowKlient();
    if (rek.status === 'CONFIRMED' || !rek.paymentId || !paynow) return { status: rek.status };
    let status: StatusPlatnosciPaynow;
    try {
      const odp = await paynow.statusPlatnosci(rek.paymentId);
      if (odp.paymentId !== rek.paymentId || !czyStatusPaynow(odp.status)) return { status: rek.status };
      status = odp.status;
    } catch (err) {
      this.logger.warn(`Paynow: odczyt statusu ${rek.paymentId} nie powiódł się: ${err instanceof Error ? err.message : String(err)}`);
      return { status: rek.status };
    }
    await this.zastosujStatusPaynow(rek, status);
    return { status };
  }

  private async zastosujStatusPaynow(rek: RekordPaynow, status: StatusPlatnosciPaynow): Promise<void> {
    if (status === 'CONFIRMED') {
      await this.zaksiegujPaynow(rek);
      return;
    }
    // CONFIRMED jest końcowy: spóźnione NEW/PENDING/… (powiadomienia nie po kolei) go nie cofają.
    await this.prisma.paynowPlatnosc.updateMany({
      where: { id: rek.id, status: { not: 'CONFIRMED' } },
      data: { status },
    });
  }

  private async zaksiegujPaynow(rek: RekordPaynow): Promise<void> {
    if (!rek.paymentId) throw new Error(`Paynow: rekord ${rek.id} bez paymentId`);
    const meta = (rek.meta ?? {}) as Record<string, string>;
    // Idempotentne po kluczu: duplikat powiadomienia, wyścig powiadomienia ze sprawdzeniem po powrocie —
    // K wchodzą raz (unikalny idempotencyKey w księdze).
    const { wpis, kredytK } = await this.doladowanie.zaksieguj({
      userId: rek.userId,
      kwotaMinor: rek.kwotaMinor,
      waluta: rek.waluta,
      meta,
      idempotencyKey: `paynow:${rek.paymentId}`,
      paymentRef: rek.paymentId,
      paymentProvider: 'PAYNOW',
      opis: `Doładowanie Paynow (${rek.paymentId})`,
      zaplaconoAt: new Date(),
    });
    // Skutki uboczne (bonus, e-mail, EKO) uruchamia tylko ten, kto przestawił rekord na CONFIRMED.
    // Padnięcie po zaksięgowaniu, a przed tym zapisem: ponowienie zaksięguje „na sucho” i dokończy.
    const { count } = await this.prisma.paynowPlatnosc.updateMany({
      where: { id: rek.id, status: { not: 'CONFIRMED' } },
      data: { status: 'CONFIRMED', walletTxId: wpis.id },
    });
    if (count === 0) return;
    await this.poZaksiegowaniuDoladowania({
      userId: rek.userId,
      wpis,
      kredytK,
      meta,
      kwota: (rek.kwotaMinor / 100).toFixed(2),
      waluta: rek.waluta,
      odniesienie: `paynow:${rek.id}`,
      szczegoly: { provider: 'PAYNOW', paynowId: rek.id, paymentId: rek.paymentId },
    });
  }

  private async zglosNiezgodnoscPaynow(rek: RekordPaynow, paymentId: string, status: string): Promise<void> {
    this.logger.error(
      `Paynow: powiadomienie ${paymentId} (${status}) dla doładowania ${rek.id}, które ma płatność ${rek.paymentId} — bez księgowania`,
    );
    await this.audit.record({
      action: 'PAYNOW_PLATNOSC_NIEZGODNA',
      userId: rek.userId,
      details: { paynowId: rek.id, oczekiwanyPaymentId: rek.paymentId, otrzymanyPaymentId: paymentId, status },
    });
    if (status !== 'CONFIRMED') return;
    const admini = await this.prisma.user.findMany({ where: { role: 'ADMIN', loginBlocked: false }, select: { id: true } });
    await this.prisma.notification.createMany({
      data: admini.map((a) => ({
        userId: a.id,
        category: 'SYSTEM',
        severity: 'warning',
        title: 'Paynow: potwierdzona płatność nie pasuje do doładowania',
        body: `Płatność ${paymentId} potwierdzona dla doładowania ${rek.id} (oczekiwana ${rek.paymentId}). Portfel nie został uznany — sprawdź w panelu Paynow i uznaj ręcznie.`,
        link: `/customers/${rek.userId}`,
      })),
    });
  }

  /**
   * Zwrot doładowania Paynow z panelu admina: zlecenie zwrotu w Paynow (Idempotency-Key wyliczany ze stanu,
   * więc ponowienie po zerwanym połączeniu nie zleci drugiego zwrotu), potem cofnięcie K z portfela tymi
   * samymi regułami co zwrot w Stripe ({@link cofnijDoladowanie}): proporcjonalnie, nie poniżej zera.
   * https://docs.paynow.pl/docs/v3/refunds#make-a-refund
   */
  /**
   * `wPaneluPaynow`: zwrot zrobiony ręcznie w panelu sprzedawcy Paynow — API go nie zgłasza
   * (brak powiadomień o zwrotach i listy zwrotów płatności, https://docs.paynow.pl/docs/v3/refunds),
   * więc tylko cofamy K, bez drugiego zlecenia w Paynow. Klucz z idem: dwuklik nie cofa dwa razy.
   */
  async zwrocPlatnoscPaynow(i: { walletTxId: string; kwota?: number | null; actorUserId: string; wPaneluPaynow?: boolean }) {
    const paynow = this.paynowKlient();
    if (!paynow) throw new ServiceUnavailableException('Paynow nie jest skonfigurowany.');
    const rek = await this.prisma.paynowPlatnosc.findUnique({ where: { walletTxId: i.walletTxId } });
    if (!rek || rek.status !== 'CONFIRMED' || !rek.paymentId) {
      throw new BadRequestException('To nie jest zaksięgowane doładowanie Paynow.');
    }
    const pozostalo = rek.kwotaMinor - rek.zwroconoMinor;
    const kwotaMinor = i.kwota == null ? pozostalo : Math.round(i.kwota * 100);
    if (kwotaMinor <= 0 || kwotaMinor > pozostalo) {
      throw new BadRequestException(`Kwota zwrotu musi być z zakresu 0,01–${(pozostalo / 100).toFixed(2)} zł.`);
    }
    // ≤ 45 znaków wg API reference; ten sam stan + ta sama kwota = ten sam klucz.
    const idem = createHash('sha256').update(`zwrot:${rek.id}:${rek.zwroconoMinor}:${kwotaMinor}`).digest('base64url');
    let odp: { refundId: string; status: string };
    try {
      odp = i.wPaneluPaynow
        ? { refundId: `panel-${idem}`, status: 'WYKONANY_W_PANELU' }
        : await paynow.zwrot(rek.paymentId, { amount: kwotaMinor, reason: 'OTHER' }, idem);
    } catch (err) {
      const typy = err instanceof PaynowBlad ? err.typyBledow.join(', ') : '';
      this.logger.error(`Paynow: zwrot ${rek.paymentId} odrzucony: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException(`Paynow odrzucił zwrot${typy ? ` (${typy})` : ''}.`);
    }
    const wplata = await this.prisma.walletTransaction.findUniqueOrThrow({ where: { id: i.walletTxId } });
    const wynik = await this.prisma.$transaction(async (tx) => {
      // Blokada rekordu: równoległy zwrot (albo ponowienie z tym samym refundId) liczy się po kolei i raz.
      const [r] = await tx.$queryRaw<Array<{ zwroconoMinor: number; zwrotyIds: string[] }>>`SELECT "zwroconoMinor", "zwrotyIds" FROM "PaynowPlatnosc" WHERE "id" = ${rek.id} FOR UPDATE`;
      if (!r || r.zwrotyIds.includes(odp.refundId)) return null;
      const narastajaco = r.zwroconoMinor + kwotaMinor;
      await tx.paynowPlatnosc.update({
        where: { id: rek.id },
        data: { zwroconoMinor: narastajaco, zwrotyIds: { push: odp.refundId } },
      });
      return this.cofnijDoladowanie(tx, {
        wplata,
        zwroconoMinorNarastajaco: narastajaco,
        idempotencyKey: `paynow:zwrot:${odp.refundId}`,
        opis: i.wPaneluPaynow ? 'Zwrot wykonany w panelu Paynow — cofnięcie doładowania' : 'Zwrot płatności Paynow — cofnięcie doładowania',
        metadata: { paynowRefundId: odp.refundId, paynowId: rek.id },
      });
    });
    if (wynik) {
      await this.zglosCofniecie({
        wplata,
        ...wynik,
        akcja: 'WALLET_TOPUP_REFUNDED',
        tytul: 'Zwrot płatności w Paynow',
        szczegoly: { provider: 'PAYNOW', paynowRefundId: odp.refundId, kwotaZwrotu: (kwotaMinor / 100).toFixed(2), actorUserId: i.actorUserId, wPaneluPaynow: Boolean(i.wPaneluPaynow) },
        dopisek: '',
      });
    }
    return { refundId: odp.refundId, status: odp.status, kwota: (kwotaMinor / 100).toFixed(2) };
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
    // To samo przejęcie co przy webhooku: zdarzenie właśnie przetwarzane (świeża dzierżawa) nie idzie
    // drugi raz równolegle — „Ponów” w adminie albo harmonogram ponowień przy redelivery ze Stripe.
    if (decyzja(wiersz as WierszZdarzenia, teraz).rodzaj === 'wTrakcie') {
      throw new ConflictException(`Zdarzenie ${eventId} jest właśnie przetwarzane — spróbuj za chwilę`);
    }
    const { count } = await this.prisma.stripeWebhookEvent.updateMany({
      where: { eventId, status: wiersz.status, claimedAt: wiersz.claimedAt },
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
      case 'charge.refunded':
      case 'charge.dispute.created':
        await this.handleZwrotPlatnosci(event);
        break;
      case 'payment_method.attached':
        await this.handlePaymentMethodAttached(event);
        break;
      case 'payment_method.detached':
        await this.handlePaymentMethodDetached(event);
        break;
      default:
        this.logger.debug(`Ignoring unhandled Stripe event: ${event.type}`);
    }
  }

  /**
   * Zwrot (charge.refunded) albo spór/chargeback (charge.dispute.created) płatności za doładowanie.
   * Do 2026-09-27 żadne z tych zdarzeń nie było obsługiwane: pieniądze wracały do klienta przez bank,
   * a K zostawały w portfelu — klasyczna ścieżka nadużycia (doładuj kradzioną kartą, wydaj, chargeback).
   * Cofamy proporcjonalną część K (charge.refunded podaje kwotę narastająco, więc liczymy „ile powinno
   * być cofnięte” minus „ile już cofnięto”). Portfel nie schodzi poniżej zera — brakującą część
   * i korektę dokumentu doładowania zgłaszamy administratorom.
   */
  private async handleZwrotPlatnosci(event: { id: string; type: string; data: { object: Record<string, unknown> } }) {
    const o = event.data.object as { payment_intent?: string | null; amount?: number; amount_refunded?: number; reason?: string };
    const spor = event.type === 'charge.dispute.created';
    if (!o.payment_intent) return;
    const wplata = await this.prisma.walletTransaction.findFirst({
      where: { paymentRef: o.payment_intent, type: WalletTxType.TOPUP },
    });
    if (!wplata) {
      this.logger.warn(`${event.type} ${event.id}: brak doładowania dla ${o.payment_intent} — pomijam`);
      return;
    }
    const kwotaMinor = (spor ? o.amount : o.amount_refunded) ?? 0;
    // charge.refunded podaje kwotę zwrotów narastająco, spór — kwotę sporu.
    const wynik = await this.prisma.$transaction((tx) =>
      this.cofnijDoladowanie(tx, {
        wplata,
        zwroconoMinorNarastajaco: kwotaMinor,
        idempotencyKey: `stripe:${event.id}`,
        opis: spor ? 'Spór o płatność (chargeback) — cofnięcie doładowania' : 'Zwrot płatności — cofnięcie doładowania',
        metadata: { stripeEvent: event.id, powod: o.reason ?? null },
      }),
    );
    if (!wynik) return;
    await this.zglosCofniecie({
      wplata,
      ...wynik,
      akcja: spor ? 'WALLET_TOPUP_DISPUTED' : 'WALLET_TOPUP_REFUNDED',
      tytul: spor ? 'Spór o płatność (chargeback)' : 'Zwrot płatności kartą',
      szczegoly: { stripeEvent: event.id, powod: o.reason ?? null },
      dopisek: spor ? ' i zdecyduj o usługach klienta' : '',
    });
  }

  /**
   * Cofnięcie części doładowania po zwrocie pieniędzy (Stripe: zwrot/spór, Paynow: zwrot z panelu admina).
   * Do cofnięcia jest udział kwoty zwróconej NARASTAJĄCO w kwocie wpłaty, minus to, co już cofnięto
   * (wpisy z `metadata.zwrotZa`). Portfel nie schodzi poniżej zera — brak zgłasza {@link zglosCofniecie}.
   * Wołać w transakcji; blokada wiersza klienta PRZED policzeniem, ile już cofnięto: dwa zdarzenia do jednej
   * płatności (częściowe zwroty, zwrot + spór) liczą się jedno po drugim. Wcześniej oba widziały
   * „nic nie cofnięto” i oba ściągały całą resztę.
   */
  private async cofnijDoladowanie(
    tx: Prisma.TransactionClient,
    i: {
      wplata: WalletTransaction;
      zwroconoMinorNarastajaco: number;
      idempotencyKey: string;
      opis: string;
      metadata: Record<string, unknown>;
    },
  ): Promise<{ reszta: Prisma.Decimal; pobierz: Prisma.Decimal } | null> {
    const { wplata } = i;
    const zaplaconoMinor = Number((wplata.metadata as { wplata?: { kwota?: string } } | null)?.wplata?.kwota ?? 0) * 100;
    const udzial = zaplaconoMinor > 0 ? Math.min(1, i.zwroconoMinorNarastajaco / zaplaconoMinor) : 1;
    const doCofniecia = new Prisma.Decimal(wplata.amount).mul(udzial).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const [u] = await tx.$queryRaw<Array<{ walletBalance: Prisma.Decimal }>>`SELECT "walletBalance" FROM "User" WHERE "id" = ${wplata.userId} FOR UPDATE`;
    const juz = await tx.walletTransaction.findMany({
      where: { userId: wplata.userId, metadata: { path: ['zwrotZa'], equals: wplata.id } },
      select: { amount: true },
    });
    const cofniete = juz.reduce((a, t) => a.plus(new Prisma.Decimal(t.amount).abs()), new Prisma.Decimal(0));
    const reszta = doCofniecia.minus(cofniete);
    if (reszta.lessThanOrEqualTo(0)) return null;
    const saldo = new Prisma.Decimal(u?.walletBalance ?? 0);
    const pobierz = Prisma.Decimal.min(reszta, saldo.greaterThan(0) ? saldo : new Prisma.Decimal(0));
    if (pobierz.greaterThan(0)) {
      await this.ledger.zapiszWpis(
        tx,
        {
          userId: wplata.userId,
          type: WalletTxType.ADJUSTMENT,
          amount: pobierz,
          description: i.opis,
          idempotencyKey: i.idempotencyKey,
          metadata: { zwrotZa: wplata.id, ...i.metadata } as Prisma.InputJsonValue,
        },
        'debit',
        pobierz,
        pobierz.negated(),
      );
    }
    return { reszta, pobierz };
  }

  /** Audyt + powiadomienie adminów po cofnięciu doładowania (korekta dokumentu, ewentualny brak K). */
  private async zglosCofniecie(i: {
    wplata: WalletTransaction;
    reszta: Prisma.Decimal;
    pobierz: Prisma.Decimal;
    akcja: string;
    tytul: string;
    szczegoly: Record<string, unknown>;
    dopisek: string;
  }): Promise<void> {
    const { wplata, reszta, pobierz } = i;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: wplata.userId }, select: { email: true } });
    const brak = reszta.minus(pobierz);
    await this.audit.record({
      action: i.akcja,
      userId: wplata.userId,
      details: { walletTxId: wplata.id, ...i.szczegoly, cofnieteK: pobierz.toFixed(2), brakK: brak.toFixed(2) },
    });
    const admini = await this.prisma.user.findMany({ where: { role: 'ADMIN', loginBlocked: false }, select: { id: true } });
    await this.prisma.notification.createMany({
      data: admini.map((a) => ({
        userId: a.id,
        category: 'SYSTEM',
        severity: 'warning',
        title: i.tytul,
        body: `${user.email}: cofnięto ${pobierz.toFixed(2)} K z portfela${brak.greaterThan(0) ? `, brakuje ${brak.toFixed(2)} K (saldo za niskie)` : ''}. Wystaw korektę dokumentu doładowania${i.dopisek}.`,
        link: `/customers/${wplata.userId}`,
      })),
    });
  }

  /**
   * M-26 — karta zapisana w Stripe (checkout subskrypcji, auto-doładowanie) trafia
   * do PaymentMethod. Wcześniej nic tej tabeli nie zapisywało, więc lista kart w panelu
   * była zawsze pusta, a usuwanie karty nie miało czego usunąć.
   */
  private async handlePaymentMethodAttached(event: { data: { object: Record<string, unknown> } }) {
    const pm = event.data.object as {
      id?: string;
      type?: string;
      customer?: string | null;
      card?: { brand?: string; last4?: string; exp_month?: number; exp_year?: number };
    };
    if (!pm.id || pm.type !== 'card' || !pm.customer) return;
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: pm.customer },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn(`payment_method.attached ${pm.id}: brak użytkownika dla ${pm.customer}`);
      return;
    }
    const data = {
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    };
    const hasDefault = await this.prisma.paymentMethod.count({ where: { userId: user.id, isDefault: true } });
    await this.prisma.paymentMethod.upsert({
      where: { provider_providerRef: { provider: 'STRIPE', providerRef: pm.id } },
      create: { userId: user.id, provider: 'STRIPE', providerRef: pm.id, isDefault: hasDefault === 0, ...data },
      update: data,
    });
  }

  /** M-26 — karta odpięta w Stripe (także z dashboardu) znika z panelu i z auto-doładowania. */
  private async handlePaymentMethodDetached(event: { data: { object: Record<string, unknown> } }) {
    const pmId = (event.data.object as { id?: string }).id;
    if (!pmId) return;
    const row = await this.prisma.paymentMethod.findUnique({
      where: { provider_providerRef: { provider: 'STRIPE', providerRef: pmId } },
    });
    if (!row) return;
    await this.prisma.$transaction([
      this.prisma.paymentMethod.delete({ where: { id: row.id } }),
      this.prisma.user.updateMany({
        where: { id: row.userId, defaultPaymentMethodId: pmId },
        data: { defaultPaymentMethodId: null },
      }),
      this.prisma.walletAutoTopup.updateMany({
        where: { userId: row.userId, paymentMethodId: row.id },
        data: { paymentMethodId: null },
      }),
    ]);
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
    // M-09/M-10/M-34 — K po kursie NBP i stawce nabywcy, dokument przy wpłacie.
    const { wpis: tx, kredytK } = await this.doladowanie.zaksieguj({
      userId,
      kwotaMinor: session.amount_total ?? 0,
      waluta: session.currency ?? 'pln',
      meta: session.metadata,
      idempotencyKey,
      paymentRef: session.payment_intent ?? session.id ?? '',
      opis: `Doładowanie Stripe (${session.id})`,
      zaplaconoAt: new Date(),
    });

    await this.poZaksiegowaniuDoladowania({
      userId,
      wpis: tx,
      kredytK,
      meta: session.metadata ?? {},
      kwota: amountMajor.toFixed(2),
      waluta: (session.currency ?? 'pln').toUpperCase(),
      odniesienie: session.id ?? '',
      szczegoly: { sessionId: session.id, idempotent: idempotencyKey === tx.idempotencyKey },
    });
  }

  /**
   * Wspólny ciąg po zaksięgowaniu doładowania (Stripe Checkout i Paynow): audyt, bonus z kodu procentowego,
   * e-mail i punkty EKO. Dokument za wpłatę powstaje wcześniej, atomowo z wpisem (DoladowanieService.zaksieguj).
   */
  private async poZaksiegowaniuDoladowania(i: {
    userId: string;
    wpis: WalletTransaction;
    kredytK: Prisma.Decimal;
    meta: Record<string, string | undefined>;
    kwota: string;
    waluta: string;
    /** Identyfikator płatności do audytu bonusu (sesja Stripe albo `paynow:<id>`). */
    odniesienie: string;
    szczegoly: Record<string, unknown>;
  }): Promise<void> {
    const { userId, wpis: tx, kredytK, meta } = i;
    await this.audit.record({
      action: 'WALLET_TOPUP_COMPLETED',
      userId,
      details: {
        walletTxId: tx.id,
        ...i.szczegoly,
        amount: i.kwota,
        currency: i.waluta,
        creditedK: kredytK.toFixed(2),
      },
    });

    // Bonus z kodu procentowego: metadane (Stripe) / rekord (Paynow) zawierają bonus policzony po naszej
    // stronie przed przekierowaniem do płatności — klient nie zmieni procentu po stronie przeglądarki.
    const promoCodeId = meta.promoCodeId;
    // Bonus liczony od K, które faktycznie weszły (waluta obca, cena netto) — nie od kwoty w walucie.
    const procent = Number(meta.promoPercent);
    const bonusAmountStr =
      procent > 0 ? kredytK.times(procent).dividedBy(100).toDecimalPlaces(2).toFixed(2) : meta.bonusAmount;
    if (promoCodeId && bonusAmountStr) {
      try {
        await this.promo.applyPercentBonusForTopup({
          userId,
          promoCodeId,
          bonusAmount: bonusAmountStr,
          relatedWalletTxId: tx.id,
          sessionId: i.odniesienie,
        });
      } catch (err) {
        // Topup itself succeeded — bonus failure must not roll back the
        // top-up. Operator follow-up via audit log + Slack alert.
        this.logger.error(
          `applyPercentBonusForTopup failed for ${i.odniesienie} user=${userId}: ${(err as Error).message}`,
        );
        await this.audit.record({
          action: 'PROMO_PERCENT_BONUS_FAILED',
          userId,
          details: {
            sessionId: i.odniesienie,
            promoCodeId,
            bonusAmount: bonusAmountStr,
            error: (err as Error).message,
          },
        });
      }
    }

    void this.notifyWalletTopupOk({
      userId,
      amountMajor: kredytK.toFixed(2),
    }).catch((err) => {
      this.logger.warn(
        `poZaksiegowaniuDoladowania: topup mail failed user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });

    void this.ecoPoints.safeAward(`wallet_topup:${tx.id}`, async () => {
      const pts = await this.ecoPoints.awardWalletTopup(this.prisma, {
        userId,
        amountMajor: kredytK.toNumber(),
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
      // Stripe wysyła `invoice.paid` i `invoice.payment_succeeded` dla tej samej płatności (oba
      // subskrybowane, docs/ops/OPERATIONAL_CHECKLIST.md) — mail i audyt tylko przy `invoice.paid`,
      // inaczej klient dostawał dwa maile o odnowieniu.
      if (event.type === 'invoice.paid' && (created || invoice.status === 'paid')) {
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
      currency?: string;
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

    const { wpis: tx } = await this.doladowanie.zaksieguj({
      userId,
      kwotaMinor: pi.amount_received ?? 0,
      waluta: pi.currency ?? 'pln',
      meta: pi.metadata,
      idempotencyKey: `stripe:pi:${pi.id}`,
      paymentRef: pi.id,
      opis: `Auto-doładowanie portfela (PaymentIntent ${pi.id})`,
      zaplaconoAt: new Date(),
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
        ? `${panelUrl}/dashboard/billing/invoices`
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
    if (subscriptionId) {
      const localSub = await this.prisma.subscription.findFirst({
        where: { stripeSubscriptionId: subscriptionId },
        select: {
          plan: { select: { name: true } },
          account: { select: { domain: true } },
        },
      });
      if (localSub) {
        const planName = localSub.plan?.name ?? 'Hosting Verris';
        serviceName = localSub.account?.domain
          ? `${planName} (${localSub.account.domain})`
          : planName;
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
      paymentUpdateUrl,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'BILLING' });
  }
}
