import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingInterval,
  Prisma,
  Role,
  SubscriptionPaymentSource,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { MailerService } from '../mail/mailer.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { ProvisioningService } from './provisioning.service';
import { ProvisioningQueueService } from './provisioning-queue.service';
import {
  trialStartedTemplate,
  trialConvertedTemplate,
} from '../mail/templates/billing-lifecycle-notifications';
import { generateUniqueServiceTag } from './service-tag.util';
import type { StartTrialDto } from './dto/trial.dto';
import type { CreatedSubscription } from './subscriptions.service';

/**
 * O-1 — Free trial.
 *
 * A plan with `trialDays > 0` can be started without payment. The trial is a
 * normal Subscription with `isTrial=true`, price 0 and `trialEndsAt` set; the
 * account is provisioned on a node exactly like a paid one. When the window
 * ends the expiry scheduler suspends + EXPIREs it unless the customer converted.
 *
 * Abuse guards:
 *   - one trial per user account ever (`User.trialStartedAt`),
 *   - verified e-mail required (privileged accounts excluded),
 *   - domain uniqueness is enforced by the Account/Subscription provisioning.
 */
@Injectable()
export class TrialService {
  private readonly logger = new Logger(TrialService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly walletLedger: WalletLedgerService,
    private readonly provisioning: ProvisioningService,
    private readonly provisionQueue: ProvisioningQueueService,
    private readonly config: ConfigService,
  ) {}

  /** Whether this user may still start a trial (used to gate the UI). */
  async eligibility(userId: string): Promise<{ eligible: boolean; reason?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, emailVerifiedAt: true, trialStartedAt: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) return { eligible: false, reason: 'NO_USER' };
    if (user.role !== Role.USER) return { eligible: false, reason: 'NOT_CUSTOMER' };
    if (!user.emailVerifiedAt) return { eligible: false, reason: 'EMAIL_UNVERIFIED' };
    if (user.trialStartedAt) return { eligible: false, reason: 'ALREADY_USED' };
    return { eligible: true };
  }

  async startTrial(userId: string, dto: StartTrialDto): Promise<CreatedSubscription> {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive || !plan.isPublic) {
      throw new NotFoundException('Plan not found or unavailable');
    }
    if (plan.trialDays <= 0) {
      throw new BadRequestException('Ten plan nie ma dostępnego okresu próbnego.');
    }

    const elig = await this.eligibility(userId);
    if (!elig.eligible) {
      if (elig.reason === 'EMAIL_UNVERIFIED') {
        throw new ForbiddenException('Potwierdź adres e-mail, aby uruchomić okres próbny.');
      }
      if (elig.reason === 'ALREADY_USED') {
        throw new ConflictException('Wykorzystałeś już swój darmowy okres próbny.');
      }
      throw new ForbiddenException('Okres próbny nie jest dostępny dla tego konta.');
    }

    // Atomically claim the one-trial-per-user slot. The conditional updateMany
    // (trialStartedAt = null) closes the race where two requests start at once.
    const claim = await this.prisma.user.updateMany({
      where: { id: userId, trialStartedAt: null },
      data: { trialStartedAt: new Date() },
    });
    if (claim.count === 0) {
      throw new ConflictException('Wykorzystałeś już swój darmowy okres próbny.');
    }

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000);
    const listPrice = new Prisma.Decimal(plan.priceMonthly);

    // SVC-TAG — unikalny handle także dla usług próbnych (= login DA).
    const serviceTag = await generateUniqueServiceTag(this.prisma);
    let subscription;
    try {
      subscription = await this.prisma.subscription.create({
        data: {
          userId,
          planId: plan.id,
          serviceTag,
          status: SubscriptionStatus.PROVISIONING,
          interval: BillingInterval.MONTH,
          priceAmount: new Prisma.Decimal(0),
          listPriceAmount: listPrice,
          currency: plan.currency,
          paymentSource: SubscriptionPaymentSource.WALLET,
          isTrial: true,
          trialEndsAt,
          currentPeriodStart: now,
          currentPeriodEnd: trialEndsAt,
          ecoModeEnabled: dto.ecoModeEnabled ?? false,
        },
      });
    } catch (err) {
      // Roll back the trial claim so a failed create doesn't burn the slot.
      await this.prisma.user.updateMany({
        where: { id: userId, trialStartedAt: { not: null } },
        data: { trialStartedAt: null },
      });
      throw err;
    }

    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId: subscription.id,
        type: 'TRIAL_STARTED',
        details: { planSlug: plan.slug, trialDays: plan.trialDays, trialEndsAt: trialEndsAt.toISOString() },
      },
    });
    await this.audit.record({
      action: 'TRIAL_STARTED',
      userId,
      actorUserId: userId,
      details: { subscriptionId: subscription.id, plan: plan.slug, trialDays: plan.trialDays },
    });

    void this.sendTrialStarted(userId, plan.name, trialEndsAt).catch(() => undefined);

    // Provision the DA account (queue if async worker configured, else inline).
    try {
      if (this.provisionQueue.isAsync()) {
        await this.provisionQueue.enqueueManualProvision({
          subscriptionId: subscription.id,
          userId,
          domain: dto.domain,
          preferredRegion: dto.preferredRegion ?? null,
        });
        return { subscription, provisioningQueued: true };
      }
      const provisioning = await this.provisioning.provisionForSubscription(
        subscription.id,
        { domain: dto.domain, preferredRegion: dto.preferredRegion ?? null },
        userId,
      );
      return { subscription: provisioning.subscription, provisioning };
    } catch (err) {
      this.logger.error(
        `Trial provisioning failed (sub=${subscription.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw err;
    }
  }

  /**
   * Convert a running trial to a paid wallet subscription. Charges one month
   * from the wallet (must have funds) and clears the trial flag so the normal
   * renewal/hourly billing takes over.
   */
  async convertFromWallet(userId: string, subscriptionId: string): Promise<{ ok: true }> {
    const subscription = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { plan: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (!subscription.isTrial || subscription.trialConvertedAt) {
      throw new ConflictException('Ta usługa nie jest już w okresie próbnym.');
    }
    if (
      subscription.status !== SubscriptionStatus.ACTIVE &&
      subscription.status !== SubscriptionStatus.PROVISIONING
    ) {
      throw new ConflictException('Nie można przekształcić usługi w tym stanie.');
    }

    const amount = new Prisma.Decimal(subscription.plan.priceMonthly);
    await this.walletLedger.debit({
      userId,
      type: WalletTxType.CHARGE_SUBSCRIPTION,
      amount,
      description: `Przekształcenie okresu próbnego na płatny — ${subscription.plan.name}`,
      idempotencyKey: `trial-convert-${subscriptionId}`,
      subscriptionId,
    });

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        isTrial: false,
        trialConvertedAt: now,
        priceAmount: amount,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
    await this.prisma.subscriptionEvent.create({
      data: {
        subscriptionId,
        type: 'TRIAL_CONVERTED',
        details: { amount: amount.toString() },
      },
    });
    await this.audit.record({
      action: 'TRIAL_CONVERTED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, amount: amount.toString() },
    });

    void this.sendTrialConverted(userId, subscription.plan.name).catch(() => undefined);
    return { ok: true };
  }

  private panelUrl(): string {
    return (this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl').replace(
      /\/$/,
      '',
    );
  }

  private async sendTrialStarted(userId: string, planName: string, trialEndsAt: Date) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user) return;
    await this.mailer.send({
      ...trialStartedTemplate({
        to: user.email,
        firstName: user.firstName,
        planName,
        trialEndsAt,
        panelUrl: this.panelUrl(),
      }),
      userId,
      category: 'TRANSACTIONAL',
    });
  }

  private async sendTrialConverted(userId: string, planName: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (!user) return;
    await this.mailer.send({
      ...trialConvertedTemplate({
        to: user.email,
        firstName: user.firstName,
        planName,
        panelUrl: this.panelUrl(),
      }),
      userId,
      category: 'TRANSACTIONAL',
    });
  }
}
