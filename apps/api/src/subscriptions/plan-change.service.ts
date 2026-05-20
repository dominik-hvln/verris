import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingInterval,
  Plan,
  Prisma,
  Subscription,
  SubscriptionPaymentSource,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { StripeService } from '../billing/stripe/stripe.service';
import { getSubscriptionPeriod } from '../billing/stripe/stripe.client';
import { DirectAdminService } from '../servers/directadmin.service';
import { MailerService } from '../mail/mailer.service';
import { planChangedTemplate } from '../mail/templates/plan-change-notifications';
import {
  computePlanChangeProration,
  planPriceForInterval,
  type PlanChangeDirection,
} from './plan-proration.util';

type LoadedSub = Subscription & {
  plan: Plan;
  account: {
    id: string;
    domain: string;
    serverId: string;
    daUsername: string;
    scaledCpu: number;
    scaledRamMb: number;
    scaledDiskMb: number;
  } | null;
  user: { id: string; email: string; firstName: string | null; walletBalance: Prisma.Decimal };
};

@Injectable()
export class PlanChangeService {
  private readonly logger = new Logger(PlanChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly walletLedger: WalletLedgerService,
    private readonly stripe: StripeService,
    private readonly da: DirectAdminService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async previewForUser(userId: string, subscriptionId: string, targetPlanId: string) {
    const sub = await this.loadSubscription(userId, subscriptionId);
    const target = await this.resolveTargetPlan(targetPlanId);
    this.assertCanChangePlan(sub, target);
    const proration = this.prorationFor(sub, target);
    const targets = await this.listEligibleTargets(sub);

    return {
      subscriptionId: sub.id,
      currentPlanId: sub.planId,
      currentPlanName: sub.plan.name,
      interval: sub.interval,
      paymentSource: sub.paymentSource,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      remainingFraction: proration.remainingFraction,
      direction: proration.direction,
      amountDue: proration.amountDue.toFixed(2),
      amountCredit: proration.amountCredit.toFixed(2),
      currency: sub.currency,
      resetsAutoscalingDeltas: this.hasAutoscalingDeltas(sub),
      targetPlans: targets,
    };
  }

  async changeForUser(userId: string, subscriptionId: string, targetPlanId: string) {
    const sub = await this.loadSubscription(userId, subscriptionId);
    const target = await this.resolveTargetPlan(targetPlanId);
    this.assertCanChangePlan(sub, target);

    if (sub.paymentSource === SubscriptionPaymentSource.MANUAL) {
      throw new BadRequestException(
        'Ta usługa ma rozliczenie ręczne — zmiana planu wymaga kontaktu z supportem.',
      );
    }

    const proration = this.prorationFor(sub, target);
    const newPrice = planPriceForInterval(target, sub.interval);
    const idempotencyKey = `plan-change-${sub.id}-${target.id}-${sub.currentPeriodStart?.toISOString() ?? 'no-period'}`;

    if (
      proration.direction === 'upgrade' &&
      sub.paymentSource === SubscriptionPaymentSource.WALLET &&
      proration.amountDue.greaterThan(0)
    ) {
      const balance = new Prisma.Decimal(sub.user.walletBalance);
      if (balance.lessThan(proration.amountDue)) {
        throw new ConflictException(
          'Niewystarczające saldo portfela na dopłatę za upgrade planu.',
        );
      }
    }

    let walletTxId: string | null = null;
    let stripeUpdated = false;

    try {
      if (sub.paymentSource === SubscriptionPaymentSource.STRIPE_CARD) {
        await this.applyStripePlanChange(sub, target);
        stripeUpdated = true;
      }

      if (
        sub.paymentSource === SubscriptionPaymentSource.WALLET &&
        proration.direction === 'upgrade' &&
        proration.amountDue.greaterThan(0)
      ) {
        const debit = await this.walletLedger.debit({
          userId: sub.userId,
          type: WalletTxType.CHARGE_PLAN_UPGRADE,
          amount: proration.amountDue,
          description: `Upgrade planu: ${sub.plan.name} → ${target.name}`,
          idempotencyKey,
          subscriptionId: sub.id,
          metadata: {
            fromPlanId: sub.planId,
            toPlanId: target.id,
            direction: proration.direction,
          },
        });
        walletTxId = debit.id;
      }

      await this.pushDaLimits(sub, target);

      const updated = await this.commitPlanChange(sub, target, newPrice, proration, idempotencyKey);

      if (
        sub.paymentSource === SubscriptionPaymentSource.WALLET &&
        proration.direction === 'downgrade' &&
        proration.amountCredit.greaterThan(0)
      ) {
        const credit = await this.walletLedger.credit({
          userId: sub.userId,
          type: WalletTxType.CREDIT_PLAN_DOWNGRADE,
          amount: proration.amountCredit,
          description: `Downgrade planu: ${sub.plan.name} → ${target.name}`,
          idempotencyKey: `${idempotencyKey}-credit`,
          subscriptionId: sub.id,
          metadata: {
            fromPlanId: sub.planId,
            toPlanId: target.id,
            direction: proration.direction,
          },
        });
        walletTxId = credit.id;
      }

      await this.audit.record({
        action: 'PLAN_CHANGED',
        userId: sub.userId,
        actorUserId: userId,
        details: {
          subscriptionId: sub.id,
          fromPlanId: sub.planId,
          toPlanId: target.id,
          direction: proration.direction,
          amountDue: proration.amountDue.toFixed(2),
          amountCredit: proration.amountCredit.toFixed(2),
          walletTransactionId: walletTxId,
        },
      });

      await this.sendPlanChangedEmail(sub, target, proration);

      return {
        subscriptionId: updated.id,
        fromPlanId: sub.planId,
        toPlanId: target.id,
        direction: proration.direction,
        amountDue: proration.amountDue.toFixed(2),
        amountCredit: proration.amountCredit.toFixed(2),
        currency: sub.currency,
        walletTransactionId: walletTxId,
      };
    } catch (err) {
      if (
        sub.paymentSource === SubscriptionPaymentSource.WALLET &&
        walletTxId &&
        proration.direction === 'upgrade'
      ) {
        try {
          await this.walletLedger.credit({
            userId: sub.userId,
            type: WalletTxType.REFUND,
            amount: proration.amountDue,
            description: `Zwrot: nieudana zmiana planu ${sub.id}`,
            idempotencyKey: `${idempotencyKey}-rollback`,
            subscriptionId: sub.id,
          });
        } catch (refundErr) {
          this.logger.error(
            `Plan change rollback refund failed sub=${sub.id}: ${(refundErr as Error).message}`,
          );
        }
      }
      if (stripeUpdated) {
        this.logger.error(
          `Plan change failed after Stripe update sub=${sub.id} — wymaga ręcznej weryfikacji w Stripe`,
        );
      }
      throw err;
    }
  }

  private async loadSubscription(userId: string, subscriptionId: string): Promise<LoadedSub> {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: {
        plan: true,
        account: true,
        user: {
          select: { id: true, email: true, firstName: true, walletBalance: true },
        },
      },
    });
    if (!sub) throw new NotFoundException('Subskrypcja nie została znaleziona');
    return sub as LoadedSub;
  }

  private async resolveTargetPlan(targetPlanId: string): Promise<Plan> {
    const plan = await this.prisma.plan.findUnique({ where: { id: targetPlanId } });
    if (!plan || !plan.isActive || !plan.isPublic) {
      throw new BadRequestException('Wybrany plan nie jest dostępny do zmiany.');
    }
    return plan;
  }

  private assertCanChangePlan(sub: LoadedSub, target: Plan) {
    if (sub.status !== SubscriptionStatus.ACTIVE) {
      throw new BadRequestException(
        'Zmiana planu jest możliwa tylko dla aktywnej usługi z opłaconą subskrypcją.',
      );
    }
    if (!sub.account) {
      throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego — poczekaj na provisioning.');
    }
    if (sub.planId === target.id) {
      throw new BadRequestException('Ta usługa jest już na wybranym planie.');
    }
    if (!sub.currentPeriodStart || !sub.currentPeriodEnd) {
      throw new BadRequestException(
        'Brak danych o bieżącym okresie rozliczeniowym — skontaktuj się z supportem.',
      );
    }
    if (sub.currentPeriodEnd <= new Date()) {
      throw new BadRequestException('Bieżący okres rozliczeniowy wygasł — odśwież usługę lub skontaktuj się z supportem.');
    }
  }

  private prorationFor(sub: LoadedSub, target: Plan) {
    return computePlanChangeProration({
      oldPeriodPrice: sub.priceAmount,
      newPeriodPrice: planPriceForInterval(target, sub.interval),
      periodStart: sub.currentPeriodStart!,
      periodEnd: sub.currentPeriodEnd!,
    });
  }

  private hasAutoscalingDeltas(sub: LoadedSub): boolean {
    if (!sub.account) return false;
    return (
      sub.account.scaledCpu > 0 ||
      sub.account.scaledRamMb > 0 ||
      sub.account.scaledDiskMb > 0 ||
      sub.autoscalingEnabled
    );
  }

  private async listEligibleTargets(sub: LoadedSub) {
    const plans = await this.prisma.plan.findMany({
      where: { isPublic: true, isActive: true, id: { not: sub.planId } },
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
    });
    return plans.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      cpuLimit: p.cpuLimit,
      ramLimitMb: p.ramLimitMb,
      diskLimitMb: p.diskLimitMb,
      priceForInterval: planPriceForInterval(p, sub.interval).toFixed(2),
      currency: p.currency,
    }));
  }

  private async applyStripePlanChange(sub: LoadedSub, target: Plan) {
    if (!sub.stripeSubscriptionId) {
      throw new BadRequestException('Brak powiązania ze Stripe — skontaktuj się z supportem.');
    }
    const priceId =
      sub.interval === BillingInterval.YEAR
        ? target.stripePriceYearlyId
        : target.stripePriceMonthlyId;
    if (!priceId) {
      throw new BadRequestException('Docelowy plan nie ma skonfigurowanej ceny Stripe.');
    }

    const stripeSub = await this.stripe.retrieveSubscription(sub.stripeSubscriptionId);
    const itemId = stripeSub.items?.data?.[0]?.id;
    if (!itemId) {
      throw new BadRequestException('Nie można odczytać pozycji subskrypcji Stripe.');
    }

    const updated = await this.stripe.updateSubscriptionPrice({
      subscriptionId: sub.stripeSubscriptionId,
      subscriptionItemId: itemId,
      newPriceId: priceId,
      prorationBehavior: 'create_prorations',
    });

    const period = getSubscriptionPeriod(updated);
    await this.prisma.subscription.update({
      where: { id: sub.id },
      data: {
        currentPeriodStart: new Date(period.start * 1000),
        currentPeriodEnd: new Date(period.end * 1000),
      },
    });
  }

  private async pushDaLimits(sub: LoadedSub, target: Plan) {
    const account = sub.account!;
    const client = await this.da.getClientForServer(account.serverId);
    await client.setAccountLimits(account.daUsername, {
      cpuPercent: target.cpuLimit,
      memoryMb: target.ramLimitMb,
      diskQuotaMb: target.diskLimitMb,
      ioKbps: target.ioLimitKbps,
      iops: target.iopsLimit,
      entryProcesses: target.entryProcesses,
      nproc: target.nprocLimit,
    });
  }

  private async commitPlanChange(
    sub: LoadedSub,
    target: Plan,
    newPrice: Prisma.Decimal,
    proration: { direction: PlanChangeDirection },
    idempotencyKey: string,
  ) {
    const oldPlan = sub.plan;
    const account = sub.account!;
    const deltaCpu = target.cpuLimit - oldPlan.cpuLimit;
    const deltaRam = target.ramLimitMb - oldPlan.ramLimitMb;
    const deltaDisk = target.diskLimitMb - oldPlan.diskLimitMb;

    return this.prisma.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: account.id },
        data: {
          scaledCpu: 0,
          scaledRamMb: 0,
          scaledDiskMb: 0,
          cpuLimit: target.cpuLimit,
          ramLimitMb: target.ramLimitMb,
          diskLimitMb: target.diskLimitMb,
          ioLimitKbps: target.ioLimitKbps,
          iopsLimit: target.iopsLimit,
          entryProcesses: target.entryProcesses,
          nprocLimit: target.nprocLimit,
        },
      });

      if (deltaCpu !== 0 || deltaRam !== 0 || deltaDisk !== 0) {
        await tx.server.update({
          where: { id: account.serverId },
          data: {
            ...(deltaCpu !== 0 ? { allocatedCpu: { increment: deltaCpu } } : {}),
            ...(deltaRam !== 0 ? { allocatedMemory: { increment: deltaRam } } : {}),
            ...(deltaDisk !== 0 ? { allocatedDisk: { increment: deltaDisk } } : {}),
          },
        });
      }

      const updated = await tx.subscription.update({
        where: { id: sub.id },
        data: {
          planId: target.id,
          priceAmount: newPrice,
          listPriceAmount: newPrice,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          type: 'PLAN_CHANGED',
          details: {
            fromPlanId: oldPlan.id,
            fromPlanSlug: oldPlan.slug,
            toPlanId: target.id,
            toPlanSlug: target.slug,
            direction: proration.direction,
            idempotencyKey,
            autoscalingDeltasReset: true,
          },
        },
      });

      return updated;
    });
  }

  private async sendPlanChangedEmail(
    sub: LoadedSub,
    target: Plan,
    proration: { direction: PlanChangeDirection; amountDue: Prisma.Decimal; amountCredit: Prisma.Decimal },
  ) {
    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const domain = sub.account?.domain ?? sub.id;

    try {
      await this.mailer.send(
        planChangedTemplate({
          to: sub.user.email,
          userId: sub.userId,
          firstName: sub.user.firstName,
          domain,
          fromPlanName: sub.plan.name,
          toPlanName: target.name,
          direction: proration.direction,
          amountDue: proration.amountDue.toFixed(2),
          amountCredit: proration.amountCredit.toFixed(2),
          currency: sub.currency,
          panelUrl,
          serviceUrl: `${panelUrl}/dashboard/services/${sub.id}/plan`,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Plan change email failed sub=${sub.id}: ${(err as Error).message}`,
      );
    }
  }
}
