import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountStatus,
  BillingInterval,
  Prisma,
  Subscription,
  SubscriptionPaymentSource,
  SubscriptionStatus,
  WalletTxType,
} from '@ekohost/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { StripeService } from '../billing/stripe/stripe.service';
import { DirectAdminService } from '../servers/directadmin.service';
import { ProvisioningService, ProvisionResult } from './provisioning.service';
import { ProvisioningQueueService } from './provisioning-queue.service';
import { UpdateSubscriptionPreferencesDto, CreateSubscriptionDto } from './dto/subscription.dto';

export type SuspendReason =
  | 'PAYMENT_FAILED'
  | 'GRACE_EXPIRED'
  | 'ABUSE'
  | 'MANUAL_ADMIN'
  | 'CUSTOMER_REQUEST';

export interface CreatedSubscription {
  subscription: Subscription;
  provisioning?: ProvisionResult;
  /**
   * If non-null, the caller (panel) should redirect the user to this URL to
   * complete the first card payment. Once the payment succeeds the Stripe
   * webhook will activate the subscription via `activateAfterStripePayment`.
   */
  checkoutRedirectUrl?: string;
  /**
   * For Stripe Subscriptions created with `payment_behavior=default_incomplete`,
   * we expose the PaymentIntent client secret so the panel could (in the future)
   * present an in-page Stripe Elements confirm flow. For now the panel just
   * redirects to `checkoutRedirectUrl`, which is the Stripe Hosted Invoice URL.
   */
  paymentIntentClientSecret?: string;
  /** When set, provisioning was enqueued to Redis/BullMQ — poll GET /subscriptions/:id until ACTIVE. */
  provisioningQueued?: boolean;
}

/**
 * Sale + lifecycle for Subscription records. Today this layer:
 *   - Validates plan & interval
 *   - Records sale price snapshot
 *   - For WALLET source: debits the wallet immediately and provisions DA inline
 *   - For STRIPE_CARD: creates the row in PENDING_PAYMENT and returns a hint
 *     so the caller can spin up Stripe Checkout (Stripe recurring will land
 *     in EPIC C — for now we accept that this branch is "stub").
 *   - For MANUAL: marks PROVISIONING and provisions DA inline (used for
 *     comp accounts, bug bounties, free trials).
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly walletLedger: WalletLedgerService,
    private readonly stripe: StripeService,
    private readonly provisioning: ProvisioningService,
    private readonly provisionQueue: ProvisioningQueueService,
    private readonly da: DirectAdminService,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async listForUser(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: { select: { id: true, slug: true, name: true } },
        account: {
          select: {
            id: true,
            daUsername: true,
            domain: true,
            status: true,
            serverId: true,
          },
        },
      },
    });
  }

  async getForUser(userId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: {
        plan: true,
        account: { include: { server: { select: { id: true, name: true, region: true } } } },
      },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    return subscription;
  }

  /** EKO / tryb oszczędny — można zmienić po zakupie (Etap G). */
  async updatePreferences(
    userId: string,
    subscriptionId: string,
    dto: UpdateSubscriptionPreferencesDto,
  ): Promise<Subscription & { ecoDaSync?: { adjusted: number; notice: string | null } }> {
    const prev = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: { select: { id: true } } },
    });
    if (!prev) throw new NotFoundException('Subscription not found');

    const ecoToggle = dto.ecoModeEnabled;
    const updated = await this.prisma.$transaction(async (tx) => {
      const subRow = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { ecoModeEnabled: ecoToggle },
      });
      if (ecoToggle && !prev.ecoModeEnabled) {
        await tx.user.update({
          where: { id: userId },
          data: { ecoPoints: { increment: 5 } },
        });
        await tx.ecoPointsLedgerEntry.create({
          data: {
            userId,
            delta: 5,
            reason: 'EKO_FIRST_ENABLE',
            subscriptionId,
          },
        });
      }
      return subRow;
    });

    let ecoDaSync: { adjusted: number; notice: string | null } | undefined;
    if (typeof ecoToggle === 'boolean' && prev.account?.id) {
      try {
        ecoDaSync = await this.da.applyEcoModeBackupCronPolicy(subscriptionId, userId, ecoToggle);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`ecoDaSync failed sub=${subscriptionId}: ${msg}`);
        ecoDaSync = { adjusted: 0, notice: `DirectAdmin: ${msg}` };
      }
    }

    return Object.assign(updated, ecoDaSync !== undefined ? { ecoDaSync } : {});
  }

  // ---------------------------------------------------------------------------
  // Sale flow
  // ---------------------------------------------------------------------------

  async create(userId: string, dto: CreateSubscriptionDto): Promise<CreatedSubscription> {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive || !plan.isPublic) {
      throw new NotFoundException('Plan not found or unavailable');
    }

    const priceAmount =
      dto.interval === BillingInterval.MONTH ? plan.priceMonthly : plan.priceYearly;

    if (priceAmount === null || priceAmount === undefined) {
      throw new BadRequestException('Plan does not have a price for the requested interval');
    }

    // Create subscription row up-front in PENDING_PAYMENT so we can attach
    // the wallet entry / provisioning to it (and recover from failures).
    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        status: SubscriptionStatus.PENDING_PAYMENT,
        interval: dto.interval,
        priceAmount,
        currency: plan.currency,
        paymentSource: dto.paymentSource,
        autoscalingEnabled: dto.autoscalingEnabled ?? false,
        ecoModeEnabled: dto.ecoModeEnabled ?? false,
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: 'CREATED',
        details: { planSlug: plan.slug, interval: dto.interval, source: dto.paymentSource },
      },
    });

    await this.audit.record({
      action: 'SUBSCRIPTION_CREATED',
      userId,
      actorUserId: userId,
      details: {
        subscriptionId: subscription.id,
        plan: plan.slug,
        interval: dto.interval,
        source: dto.paymentSource,
      },
    });

    switch (dto.paymentSource) {
      case SubscriptionPaymentSource.WALLET: {
        return this.payFromWalletAndProvision(subscription.id, priceAmount, dto, userId);
      }
      case SubscriptionPaymentSource.MANUAL: {
        return this.provisionWithoutCharge(subscription.id, dto, userId);
      }
      case SubscriptionPaymentSource.STRIPE_CARD: {
        return this.startStripeRecurring(subscription.id, plan, dto, userId);
      }
      default:
        throw new BadRequestException('Unsupported payment source');
    }
  }

  /**
   * Cancels a subscription. By default we suspend at the current period end —
   * but for now (no recurring) we cancel immediately and tear down DA.
   */
  async cancel(userId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status === SubscriptionStatus.CANCELED) {
      throw new ConflictException('Subscription is already canceled');
    }

    // Try to suspend on the node first — we don't delete the DA account on
    // customer-initiated cancel so they have time to download backups.
    if (subscription.account && subscription.account.status === AccountStatus.ACTIVE) {
      await this.suspendOnDa(subscription.account.serverId, subscription.account.daUsername).catch(
        (err) => {
          this.logger.warn(
            `DA suspend failed during cancel for sub=${subscriptionId}: ${(err as Error).message}`,
          );
        },
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.CANCELED, canceledAt: now, cancelAt: now },
      });
      if (subscription.account) {
        await tx.account.update({
          where: { id: subscription.account.id },
          data: { status: AccountStatus.SUSPENDED },
        });
      }
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'CANCELED',
          details: { actor: userId, source: 'CUSTOMER' },
        },
      });
      return sub;
    });

    await this.audit.record({
      action: 'SUBSCRIPTION_CANCELED',
      userId,
      actorUserId: userId,
      details: { subscriptionId },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Suspend / unsuspend (used by admin tools, abuse handling, B-11 grace cron)
  // ---------------------------------------------------------------------------

  /**
   * Marks the subscription as SUSPENDED and asks DirectAdmin to suspend the
   * underlying account. Idempotent — calling on an already-suspended record
   * is a no-op (no DA call).
   */
  async suspend(opts: {
    subscriptionId: string;
    reason: SuspendReason;
    actorUserId?: string | null;
    /** Free-form note saved in audit / SubscriptionEvent. */
    note?: string;
  }): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: opts.subscriptionId },
      include: { account: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status === SubscriptionStatus.SUSPENDED) {
      this.logger.debug(`Subscription ${opts.subscriptionId} already SUSPENDED — skipping`);
      return subscription;
    }
    if (
      subscription.status === SubscriptionStatus.CANCELED ||
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
      throw new ConflictException(
        `Cannot suspend subscription in terminal status=${subscription.status}`,
      );
    }

    let daSuspended = false;
    let daError: string | null = null;
    if (subscription.account && subscription.account.status !== AccountStatus.SUSPENDED) {
      try {
        await this.suspendOnDa(subscription.account.serverId, subscription.account.daUsername);
        daSuspended = true;
      } catch (err) {
        daError = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `DA suspend failed for sub=${opts.subscriptionId} (${subscription.account.daUsername}): ${daError}`,
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.SUSPENDED },
      });
      if (subscription.account) {
        await tx.account.update({
          where: { id: subscription.account.id },
          data: { status: AccountStatus.SUSPENDED },
        });
      }
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'SUSPENDED',
          details: {
            reason: opts.reason,
            note: opts.note ?? null,
            daSuspended,
            daError,
          },
        },
      });
      return sub;
    });

    await this.audit.record({
      action: 'SUBSCRIPTION_SUSPENDED',
      userId: subscription.userId,
      actorUserId: opts.actorUserId ?? null,
      details: {
        subscriptionId: subscription.id,
        reason: opts.reason,
        note: opts.note ?? null,
        daSuspended,
        daError,
      },
    });

    return updated;
  }

  /**
   * Restores a suspended subscription: optional renewal charge from wallet,
   * unsuspend on DA, flip to ACTIVE.
   */
  async unsuspend(opts: {
    subscriptionId: string;
    actorUserId?: string | null;
    note?: string;
    /** If true, debit one billing period from the wallet to extend `currentPeriodEnd`. */
    chargeRenewal?: boolean;
  }): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: opts.subscriptionId },
      include: { account: true, plan: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status !== SubscriptionStatus.SUSPENDED) {
      throw new ConflictException(
        `Cannot unsuspend subscription in status=${subscription.status}`,
      );
    }

    let renewalTxId: string | null = null;
    if (opts.chargeRenewal) {
      const debit = await this.walletLedger.debit({
        userId: subscription.userId,
        type: WalletTxType.CHARGE_SUBSCRIPTION,
        amount: subscription.priceAmount,
        description: `Manual renewal during unsuspend (${subscription.id})`,
        idempotencyKey: `sub-${subscription.id}-manual-renew-${Date.now()}`,
        subscriptionId: subscription.id,
      });
      renewalTxId = debit.id;
    }

    let daUnsuspended = false;
    let daError: string | null = null;
    if (subscription.account) {
      try {
        await this.unsuspendOnDa(subscription.account.serverId, subscription.account.daUsername);
        daUnsuspended = true;
      } catch (err) {
        daError = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `DA unsuspend failed for sub=${opts.subscriptionId}: ${daError}`,
        );
        if (opts.chargeRenewal) {
          // Best-effort refund if renewal was charged but DA refused to bring
          // the account back online.
          await this.walletLedger
            .credit({
              userId: subscription.userId,
              type: WalletTxType.REFUND,
              amount: subscription.priceAmount,
              description: `Refund: failed unsuspend on DA for ${subscription.id}`,
              idempotencyKey: `sub-${subscription.id}-manual-renew-refund-${Date.now()}`,
              subscriptionId: subscription.id,
            })
            .catch(() => undefined);
        }
        throw err;
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const periodEnd =
        opts.chargeRenewal && subscription.currentPeriodEnd
          ? addInterval(subscription.currentPeriodEnd, subscription.interval)
          : subscription.currentPeriodEnd;
      const sub = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd: periodEnd,
        },
      });
      if (subscription.account) {
        await tx.account.update({
          where: { id: subscription.account.id },
          data: { status: AccountStatus.ACTIVE },
        });
      }
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'UNSUSPENDED',
          details: {
            note: opts.note ?? null,
            daUnsuspended,
            renewalTxId,
          },
        },
      });
      return sub;
    });

    await this.audit.record({
      action: 'SUBSCRIPTION_UNSUSPENDED',
      userId: subscription.userId,
      actorUserId: opts.actorUserId ?? null,
      details: {
        subscriptionId: subscription.id,
        renewalTxId,
        daUnsuspended,
        note: opts.note ?? null,
      },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Autoscaling settings (D-8)
  // ---------------------------------------------------------------------------

  /**
   * Updates per-subscription autoscaling preferences. The customer can:
   *   - flip autoscaling on/off,
   *   - set a monthly cap (PLN) — when reached, the engine will refuse to
   *     scale further and notify the user (D-7 notifications, separate sprint).
   *
   * The flip is recorded in the audit log so we can reconstruct who toggled
   * what when investigating bills.
   */
  async setAutoscaling(opts: {
    userId: string;
    subscriptionId: string;
    enabled: boolean;
    maxMonthlyCost?: number;
  }): Promise<Subscription> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: opts.subscriptionId, userId: opts.userId },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status === SubscriptionStatus.CANCELED) {
      throw new ConflictException('Cannot modify autoscaling on a canceled subscription');
    }

    if (opts.maxMonthlyCost !== undefined) {
      if (opts.maxMonthlyCost < 0) {
        throw new BadRequestException('autoscalingMaxCost must be ≥ 0');
      }
      if (opts.maxMonthlyCost > 99_999.99) {
        throw new BadRequestException('autoscalingMaxCost must be ≤ 99 999.99');
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        autoscalingEnabled: opts.enabled,
        autoscalingMaxCost:
          opts.maxMonthlyCost !== undefined
            ? new Prisma.Decimal(opts.maxMonthlyCost.toFixed(2))
            : undefined,
        autoscalingDisabledReason: opts.enabled ? null : 'CUSTOMER_REQUEST',
      },
    });

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: opts.enabled ? 'AUTOSCALING_ENABLED' : 'AUTOSCALING_DISABLED',
        details: {
          enabled: opts.enabled,
          maxMonthlyCost: opts.maxMonthlyCost ?? null,
          previousEnabled: subscription.autoscalingEnabled,
          previousMaxMonthlyCost: subscription.autoscalingMaxCost.toString(),
        },
      },
    });

    await this.audit.record({
      action: opts.enabled ? 'AUTOSCALING_ENABLED' : 'AUTOSCALING_DISABLED',
      userId: opts.userId,
      actorUserId: opts.userId,
      details: {
        subscriptionId: subscription.id,
        enabled: opts.enabled,
        maxMonthlyCost: opts.maxMonthlyCost ?? null,
      },
    });

    return updated;
  }

  /**
   * Returns autoscaling event log + matching wallet charges for a single
   * subscription, restricted to the owner. Used by D-9 (cost history view).
   */
  async getAutoscalingHistory(userId: string, subscriptionId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      select: {
        id: true,
        autoscalingEnabled: true,
        autoscalingMaxCost: true,
        autoscalingDisabledReason: true,
      },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');

    const [events, charges] = await Promise.all([
      this.prisma.autoscalingEvent.findMany({
        where: { subscriptionId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.walletTransaction.findMany({
        where: { subscriptionId, type: WalletTxType.CHARGE_AUTOSCALING },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);

    // 30-day spend total — handy for the panel header.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentCharges = charges.filter((c) => c.createdAt >= since);
    const last30dSpend = recentCharges.reduce(
      (acc, c) => acc + Number(c.amount),
      0,
    );

    return {
      subscription,
      events,
      charges,
      last30dSpend: last30dSpend.toFixed(2),
      currency: 'PLN',
    };
  }

  private async suspendOnDa(serverId: string, daUsername: string) {
    const client = await this.da.getClientForServer(serverId);
    await client.suspendAccount(daUsername);
  }

  private async unsuspendOnDa(serverId: string, daUsername: string) {
    const client = await this.da.getClientForServer(serverId);
    await client.unsuspendAccount(daUsername);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async payFromWalletAndProvision(
    subscriptionId: string,
    amount: Prisma.Decimal,
    dto: CreateSubscriptionDto,
    userId: string,
  ): Promise<CreatedSubscription> {
    // Debit first — if the user is broke we don't want to start any DA work.
    const debit = await this.walletLedger.debit({
      userId,
      type: WalletTxType.CHARGE_SUBSCRIPTION,
      amount,
      description: `Subscription ${subscriptionId} (initial payment)`,
      idempotencyKey: `sub-${subscriptionId}-initial`,
      subscriptionId,
    });

    let subscription = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.PROVISIONING,
        currentPeriodStart: new Date(),
        currentPeriodEnd: addInterval(new Date(), dto.interval),
      },
    });

    try {
      if (this.provisionQueue.isAsync()) {
        await this.provisionQueue.enqueueWalletProvision({
          subscriptionId,
          userId,
          domain: dto.domain,
          preferredRegion: dto.preferredRegion ?? null,
          refundAmount: amount,
        });
        return { subscription, provisioningQueued: true };
      }
      const provisioning = await this.provisioning.provisionForSubscription(
        subscriptionId,
        { domain: dto.domain, preferredRegion: dto.preferredRegion ?? null },
        userId,
      );
      return { subscription: provisioning.subscription, provisioning };
    } catch (err) {
      // Provisioning failed — refund the wallet so the customer isn't out of
      // pocket and surface the error.
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Provisioning failed after wallet debit (sub=${subscriptionId}): ${msg}`);
      await this.walletLedger.credit({
        userId,
        type: WalletTxType.REFUND,
        amount,
        description: `Auto-refund: provisioning failed for ${subscriptionId}`,
        idempotencyKey: `sub-${subscriptionId}-initial-refund`,
        subscriptionId,
      });
      subscription = await this.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.PENDING_PAYMENT },
      });
      throw err;
    } finally {
      this.logger.log(
        `Wallet charge applied for sub=${subscriptionId}, txId=${debit.id}, amount=${amount.toString()}`,
      );
    }
  }

  private async provisionWithoutCharge(
    subscriptionId: string,
    dto: CreateSubscriptionDto,
    userId: string,
  ): Promise<CreatedSubscription> {
    const subscription = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        status: SubscriptionStatus.PROVISIONING,
        currentPeriodStart: new Date(),
        currentPeriodEnd: addInterval(new Date(), dto.interval),
      },
    });
    if (this.provisionQueue.isAsync()) {
      await this.provisionQueue.enqueueManualProvision({
        subscriptionId,
        userId,
        domain: dto.domain,
        preferredRegion: dto.preferredRegion ?? null,
      });
      return { subscription, provisioningQueued: true };
    }
    const provisioning = await this.provisioning.provisionForSubscription(
      subscriptionId,
      { domain: dto.domain, preferredRegion: dto.preferredRegion ?? null },
      userId,
    );
    return { subscription: provisioning.subscription, provisioning };
  }

  // ---------------------------------------------------------------------------
  // Stripe recurring (C-7)
  // ---------------------------------------------------------------------------

  /**
   * Creates a Stripe Customer (lazy) + Stripe Subscription with
   * `payment_behavior=default_incomplete`. Returns the Hosted Invoice URL the
   * panel should redirect to so the customer can finish the first payment.
   * Once Stripe sends `invoice.paid`, our webhook calls
   * `activateAfterStripePayment(...)` to provision DA.
   */
  private async startStripeRecurring(
    subscriptionId: string,
    plan: Awaited<ReturnType<PrismaService['plan']['findUnique']>>,
    dto: CreateSubscriptionDto,
    userId: string,
  ): Promise<CreatedSubscription> {
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    const priceId =
      dto.interval === BillingInterval.MONTH
        ? plan.stripePriceMonthlyId
        : plan.stripePriceYearlyId;

    if (!priceId) {
      // Surface a clear error if admin hasn't configured Stripe prices yet.
      throw new BadRequestException(
        `Plan "${plan.slug}" nie ma skonfigurowanego Stripe Price (${dto.interval}). ` +
          `Uzupełnij stripePriceMonthlyId/stripePriceYearlyId w panelu admina.`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        stripeCustomerId: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const customerId = await this.ensureStripeCustomer(user);

    // Persist provisioning intent (domain + region) so the webhook can finish
    // the job without depending on Stripe metadata round-trips.
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'PROVISIONING_INTENT',
        details: {
          domain: dto.domain,
          preferredRegion: dto.preferredRegion ?? null,
        },
      },
    });

    const stripeSub = await this.stripe.createSubscription({
      customerId,
      priceId,
      metadata: {
        ekohostSubscriptionId: subscriptionId,
        ekohostUserId: userId,
        domain: dto.domain,
        preferredRegion: dto.preferredRegion ?? '',
        planSlug: plan.slug,
        interval: dto.interval,
      },
    });

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        stripeSubscriptionId: stripeSub.id,
        currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      },
    });

    let checkoutRedirectUrl: string | undefined;
    let paymentIntentClientSecret: string | undefined;
    const latest = stripeSub.latest_invoice;
    if (latest && typeof latest !== 'string') {
      checkoutRedirectUrl = latest.hosted_invoice_url ?? undefined;
      const intent = latest.payment_intent;
      if (intent && typeof intent !== 'string') {
        paymentIntentClientSecret = intent.client_secret ?? undefined;
      }
    }

    await this.audit.record({
      action: 'STRIPE_SUBSCRIPTION_CREATED',
      userId,
      actorUserId: userId,
      details: {
        subscriptionId,
        stripeSubscriptionId: stripeSub.id,
        stripeCustomerId: customerId,
        priceId,
      },
    });

    return {
      subscription: updated,
      checkoutRedirectUrl,
      paymentIntentClientSecret,
    };
  }

  private async ensureStripeCustomer(user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    stripeCustomerId: string | null;
  }): Promise<string> {
    if (user.stripeCustomerId) return user.stripeCustomerId;

    const fallbackName =
      [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || undefined;
    const name = user.companyName ?? fallbackName;

    const customer = await this.stripe.createCustomer({
      email: user.email,
      name,
      metadata: { ekohostUserId: user.id },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  // ---------------------------------------------------------------------------
  // Stripe webhook hooks (called by BillingService)
  // ---------------------------------------------------------------------------

  /**
   * Resolves our local `Subscription` from a Stripe subscription id (or the
   * `metadata.ekohostSubscriptionId` we set when we created it). Returns null
   * if no match — callers should treat that as "not ours, ignore".
   */
  async findByStripeSubscriptionId(
    stripeSubscriptionId: string,
    metadataSubscriptionId?: string | null,
  ): Promise<Subscription | null> {
    const direct = await this.prisma.subscription.findUnique({
      where: { stripeSubscriptionId },
    });
    if (direct) return direct;
    if (metadataSubscriptionId) {
      return this.prisma.subscription.findUnique({ where: { id: metadataSubscriptionId } });
    }
    return null;
  }

  /**
   * Called from the `customer.subscription.created/updated` webhook. Syncs
   * billing periods from Stripe and ensures `stripeSubscriptionId` is set on
   * our row. Idempotent.
   */
  async syncFromStripeSubscriptionEvent(stripeSub: {
    id: string;
    status: string;
    current_period_start: number;
    current_period_end: number;
    cancel_at_period_end: boolean;
    metadata: Record<string, string> | null;
  }): Promise<Subscription | null> {
    const sub = await this.findByStripeSubscriptionId(
      stripeSub.id,
      stripeSub.metadata?.ekohostSubscriptionId ?? null,
    );
    if (!sub) return null;

    const data: Prisma.SubscriptionUpdateInput = {
      stripeSubscriptionId: stripeSub.id,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
    };
    if (stripeSub.cancel_at_period_end) {
      data.cancelAt = new Date(stripeSub.current_period_end * 1000);
    }

    return this.prisma.subscription.update({ where: { id: sub.id }, data });
  }

  /**
   * Called from `invoice.paid`. Activates a PENDING_PAYMENT subscription by
   * provisioning DA, or extends the period for an already-ACTIVE one.
   * Idempotent — repeated calls for the same period return early.
   */
  async activateAfterStripePayment(opts: {
    stripeSubscriptionId: string;
    metadataSubscriptionId?: string | null;
    periodStart?: Date;
    periodEnd?: Date;
  }): Promise<Subscription | null> {
    const sub = await this.findByStripeSubscriptionId(
      opts.stripeSubscriptionId,
      opts.metadataSubscriptionId ?? null,
    );
    if (!sub) {
      this.logger.warn(
        `activateAfterStripePayment: no local sub for stripe=${opts.stripeSubscriptionId}`,
      );
      return null;
    }

    if (sub.status === SubscriptionStatus.ACTIVE) {
      // Already activated — just extend the period if Stripe gave us a new one.
      if (opts.periodEnd && (!sub.currentPeriodEnd || opts.periodEnd > sub.currentPeriodEnd)) {
        await this.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            currentPeriodStart: opts.periodStart ?? sub.currentPeriodStart,
            currentPeriodEnd: opts.periodEnd,
          },
        });
        await this.prisma.subscriptionEvent.create({
          data: {
            subscriptionId: sub.id,
            type: 'RENEWED',
            details: { source: 'STRIPE', until: opts.periodEnd.toISOString() },
          },
        });
      }
      return sub;
    }

    if (sub.status === SubscriptionStatus.CANCELED || sub.status === SubscriptionStatus.EXPIRED) {
      this.logger.warn(
        `activateAfterStripePayment: sub=${sub.id} is in terminal status=${sub.status}, ignoring`,
      );
      return sub;
    }

    if (sub.status === SubscriptionStatus.PAST_DUE) {
      // Stripe successfully retried payment; lift PAST_DUE.
      const updated = await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: opts.periodStart ?? sub.currentPeriodStart,
          currentPeriodEnd: opts.periodEnd ?? sub.currentPeriodEnd,
        },
      });
      await this.prisma.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'PAYMENT_RECOVERED',
          details: { source: 'STRIPE' },
        },
      });
      await this.audit.record({
        action: 'SUBSCRIPTION_PAYMENT_RECOVERED',
        userId: sub.userId,
        details: { subscriptionId: sub.id, stripeSubscriptionId: opts.stripeSubscriptionId },
      });
      return updated;
    }

    if (sub.status === SubscriptionStatus.PENDING_PAYMENT) {
      // First-time activation — provision DA.
      const intent = await this.prisma.subscriptionEvent.findFirst({
        where: { subscriptionId: sub.id, type: 'PROVISIONING_INTENT' },
        orderBy: { createdAt: 'desc' },
      });
      const intentDetails = (intent?.details ?? {}) as {
        domain?: string;
        preferredRegion?: string | null;
      };
      const domain = intentDetails.domain;
      if (!domain) {
        this.logger.error(
          `Cannot activate sub=${sub.id}: no PROVISIONING_INTENT with domain found`,
        );
        return sub;
      }

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.PROVISIONING,
          currentPeriodStart: opts.periodStart ?? new Date(),
          currentPeriodEnd: opts.periodEnd ?? sub.currentPeriodEnd,
        },
      });

      try {
        if (this.provisionQueue.isAsync()) {
          await this.provisionQueue.enqueueStripeProvision({
            subscriptionId: sub.id,
            userId: sub.userId,
            domain,
            preferredRegion: intentDetails.preferredRegion ?? null,
            stripeSubscriptionId: opts.stripeSubscriptionId,
          });
          const row = await this.prisma.subscription.findUnique({ where: { id: sub.id } });
          return row ?? sub;
        }
        const provisioning = await this.provisioning.provisionForSubscription(
          sub.id,
          { domain, preferredRegion: intentDetails.preferredRegion ?? null },
          sub.userId,
        );
        return provisioning.subscription;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Provisioning failed after Stripe payment for sub=${sub.id}: ${msg}`);
        // Keep the row in PROVISIONING so on-call can retry; do NOT refund —
        // Stripe already collected the money and the customer is owed an account.
        await this.audit.record({
          action: 'SUBSCRIPTION_PROVISIONING_FAILED',
          userId: sub.userId,
          details: {
            subscriptionId: sub.id,
            stripeSubscriptionId: opts.stripeSubscriptionId,
            error: msg,
          },
        });
        return sub;
      }
    }

    // PROVISIONING — let the in-flight provisioner finish.
    return sub;
  }

  /**
   * Called from `invoice.payment_failed`. Flips our row to PAST_DUE and lets
   * Stripe Smart Retries handle recovery.
   */
  async markPastDueFromStripe(opts: {
    stripeSubscriptionId: string;
    metadataSubscriptionId?: string | null;
    reason: string;
  }): Promise<Subscription | null> {
    const sub = await this.findByStripeSubscriptionId(
      opts.stripeSubscriptionId,
      opts.metadataSubscriptionId ?? null,
    );
    if (!sub) return null;
    if (
      sub.status === SubscriptionStatus.PAST_DUE ||
      sub.status === SubscriptionStatus.CANCELED ||
      sub.status === SubscriptionStatus.EXPIRED
    ) {
      return sub;
    }

    const updated = await this.prisma.subscription.update({
      where: { id: sub.id },
      data: { status: SubscriptionStatus.PAST_DUE },
    });
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        type: 'PAYMENT_FAILED',
        details: { source: 'STRIPE', reason: opts.reason },
      },
    });
    await this.audit.record({
      action: 'SUBSCRIPTION_PAST_DUE',
      userId: sub.userId,
      details: {
        subscriptionId: sub.id,
        source: 'STRIPE',
        stripeSubscriptionId: opts.stripeSubscriptionId,
        reason: opts.reason,
      },
    });
    return updated;
  }

  /**
   * Called from `customer.subscription.deleted`. Flips our row to CANCELED if
   * not already terminal; suspends the DA account on a best-effort basis.
   */
  async markCanceledFromStripe(opts: {
    stripeSubscriptionId: string;
    metadataSubscriptionId?: string | null;
  }): Promise<Subscription | null> {
    const sub = await this.findByStripeSubscriptionId(
      opts.stripeSubscriptionId,
      opts.metadataSubscriptionId ?? null,
    );
    if (!sub) return null;
    if (
      sub.status === SubscriptionStatus.CANCELED ||
      sub.status === SubscriptionStatus.EXPIRED
    ) {
      return sub;
    }

    const account = await this.prisma.account.findUnique({
      where: { subscriptionId: sub.id },
    });
    if (account && account.status === AccountStatus.ACTIVE) {
      this.suspendOnDa(account.serverId, account.daUsername).catch((err) => {
        this.logger.warn(
          `DA suspend failed during Stripe cancel for sub=${sub.id}: ${(err as Error).message}`,
        );
      });
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.CANCELED,
          canceledAt: now,
          cancelAt: now,
        },
      });
      if (account) {
        await tx.account.update({
          where: { id: account.id },
          data: { status: AccountStatus.SUSPENDED },
        });
      }
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'CANCELED',
          details: { source: 'STRIPE' },
        },
      });
      return next;
    });
    await this.audit.record({
      action: 'SUBSCRIPTION_CANCELED',
      userId: sub.userId,
      details: {
        subscriptionId: sub.id,
        source: 'STRIPE',
        stripeSubscriptionId: opts.stripeSubscriptionId,
      },
    });
    return updated;
  }
}

function addInterval(from: Date, interval: BillingInterval): Date {
  const next = new Date(from);
  if (interval === BillingInterval.MONTH) next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

// Suppress unused-warning for ForbiddenException — reserved for ownership errors
// once we expose admin-side cancel.
void ForbiddenException;
