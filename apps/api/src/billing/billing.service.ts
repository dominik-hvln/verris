import {
  BadRequestException,
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
import { StripeInvoice, StripeSubscription } from './stripe/stripe.client';
import { InvoicesService } from './invoices.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { rowsToCsv } from './csv.util';

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
      t === WalletTxType.CHARGE_AUTOSCALING ||
      t === WalletTxType.CHARGE_USAGE,
    );

    const recent = await this.prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return {
      balance: user.walletBalance.toFixed(2),
      currency: user.walletCurrency,
      totalTopupLast30d: totalTopupLast30d.toFixed(2),
      totalChargesLast30d: totalChargesLast30d.abs().toFixed(2),
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
      { header: 'amount', value: (r) => r.amount.toFixed(2) },
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
    const tx = await this.ledger.credit({
      userId: opts.userId,
      amount: opts.amount,
      type: WalletTxType.ADJUSTMENT,
      description: opts.description ?? 'Korekta administracyjna',
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
        idempotencyKey: opts.idempotencyKey ?? null,
      },
    });

    return tx;
  }

  // ---------------------------------------------------------------------------
  // Stripe: top-up checkout session
  // ---------------------------------------------------------------------------

  async createTopupCheckoutSession(opts: { userId: string; amount: number | string }) {
    const amount = new Prisma.Decimal(opts.amount);
    if (amount.lessThanOrEqualTo(0) || amount.greaterThan(10000)) {
      throw new BadRequestException('Kwota doładowania musi być z zakresu (0, 10000].');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: { id: true, email: true, walletCurrency: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const minor = Math.round(amount.toNumber() * 100);

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
      },
      description: `Doładowanie portfela Verris (${amount.toFixed(2)} ${user.walletCurrency})`,
    });

    await this.audit.record({
      action: 'WALLET_TOPUP_INITIATED',
      userId: user.id,
      details: { sessionId: session.id, amount: amount.toFixed(2), currency: user.walletCurrency },
    });

    return { url: session.url, sessionId: session.id };
  }

  // ---------------------------------------------------------------------------
  // Stripe: webhook
  // ---------------------------------------------------------------------------

  async handleStripeWebhook(rawBody: Buffer, signatureHeader: string | undefined) {
    this.stripe.verifyWebhookSignature(rawBody, signatureHeader);
    const event = this.stripe.parseEvent(rawBody);

    this.logger.log(`Stripe webhook: ${event.type} (${event.id})`);

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

    return { received: true };
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
  }

  // ---------------------------------------------------------------------------
  // Stripe Subscription webhooks (C-7)
  // ---------------------------------------------------------------------------

  private async handleSubscriptionUpsert(event: {
    type: string;
    data: { object: Record<string, unknown> };
  }) {
    const stripeSub = event.data.object as unknown as StripeSubscription;
    if (!stripeSub.id || typeof stripeSub.current_period_start !== 'number') {
      this.logger.warn(`Ignoring malformed ${event.type} payload`);
      return;
    }
    const updated = await this.subscriptions.syncFromStripeSubscriptionEvent({
      id: stripeSub.id,
      status: stripeSub.status,
      current_period_start: stripeSub.current_period_start,
      current_period_end: stripeSub.current_period_end,
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

    const subscriptionId =
      typeof invoice.subscription === 'string' ? invoice.subscription : null;

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
      }
    }
  }

  private async handleInvoicePaymentFailed(event: {
    id: string;
    data: { object: Record<string, unknown> };
  }) {
    const invoice = event.data.object as unknown as StripeInvoice;
    if (!invoice.id) return;

    const subscriptionId =
      typeof invoice.subscription === 'string' ? invoice.subscription : null;
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

    await this.prisma.walletAutoTopup.updateMany({
      where: { userId },
      data: {
        totalToppedUpAmount: { increment: amtMajor },
        totalToppedUpCount: { increment: 1 },
        lastAttemptOk: true,
        lastAttemptError: null,
      },
    });

    await this.audit.record({
      action: 'WALLET_AUTOTOPUP_SUCCEEDED',
      userId,
      details: { walletTxId: tx.id, paymentIntentId: pi.id, amount: amtMajor.toFixed(2) },
    });
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

    await this.audit.record({
      action: 'WALLET_AUTOTOPUP_PAYMENT_FAILED',
      userId: meta.verris_user_id,
      details: {
        paymentIntentId: pi.id ?? null,
        error: pi.last_payment_error?.message ?? null,
      },
    });
  }
}
