import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

/** Stałe wartości punktów — źródło prawdy dla API i panelu klienta. */
export const ECO_POINT_DELTAS = {
  EKO_FIRST_ENABLE: 5,
  BADGE_IMPRESSION: 1,
  REFERRAL_REGISTER_REFEREE: 3,
  REFERRAL_REGISTER_REFERRER: 5,
  REFERRAL_APPLIED_REFEREE: 3,
  REFERRAL_APPLIED_REFERRER: 5,
  WALLET_TOPUP_PER_TIER: 2,
  SUBSCRIPTION_FIRST_PAID: 10,
  SUBSCRIPTION_RENEWAL: 5,
  DOMAIN_FIRST_PAID: 5,
  DOMAIN_RENEWAL: 3,
  STRIPE_CARD_LINKED: 15,
  EMAIL_VERIFIED: 2,
  BILLING_PROFILE_COMPLETE: 3,
  PASSKEY_REGISTERED: 5,
} as const;

export const ECO_POINT_LIMITS = {
  WALLET_TOPUP_MIN_PLN: 20,
  WALLET_TOPUP_PLN_PER_TIER: 50,
  WALLET_TOPUP_MONTHLY_CAP: 20,
  SUBSCRIPTION_RENEWAL_YEARLY_CAP: 4,
  DOMAIN_RENEWAL_YEARLY_CAP: 2,
} as const;

export type EcoPointsReason = keyof typeof ECO_POINT_DELTAS | 'WALLET_TOPUP' | 'EKO_REDEEM_WALLET';

type Db = PrismaService | Prisma.TransactionClient;

export function isBillingProfileComplete(user: {
  companyName: string | null;
  nip: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}): boolean {
  const hasIdentity = Boolean(user.companyName?.trim() || user.nip?.trim());
  const hasAddress =
    Boolean(user.address?.trim()) &&
    Boolean(user.city?.trim()) &&
    Boolean(user.postalCode?.trim()) &&
    Boolean(user.country?.trim());
  return hasIdentity && hasAddress;
}

function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function startOfUtcYear(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
}

@Injectable()
export class EcoPointsService {
  private readonly logger = new Logger(EcoPointsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Przyznaje punkty tylko raz na parę (userId, reason, subscriptionId?, referenceId?).
   * Zwraca true gdy punkty zostały dodane.
   */
  async awardOnce(
    db: Db,
    input: {
      userId: string;
      delta: number;
      reason: string;
      subscriptionId?: string | null;
      referenceId?: string | null;
    },
  ): Promise<boolean> {
    const where: Prisma.EcoPointsLedgerEntryWhereInput = {
      userId: input.userId,
      reason: input.reason,
    };
    if (input.subscriptionId !== undefined) {
      where.subscriptionId = input.subscriptionId ?? null;
    }
    if (input.referenceId !== undefined) {
      where.referenceId = input.referenceId ?? null;
    }

    const existing = await db.ecoPointsLedgerEntry.findFirst({ where });
    if (existing) return false;

    await db.user.update({
      where: { id: input.userId },
      data: { ecoPoints: { increment: input.delta } },
    });
    await db.ecoPointsLedgerEntry.create({
      data: {
        userId: input.userId,
        delta: input.delta,
        reason: input.reason,
        subscriptionId: input.subscriptionId ?? null,
        referenceId: input.referenceId ?? null,
      },
    });
    return true;
  }

  /** +2 pkt za każde 50 PLN doładowania; min. 20 PLN; cap 20 pkt / miesiąc. */
  async awardWalletTopup(
    db: Db,
    input: { userId: string; amountMajor: number; walletTxId: string },
  ): Promise<number> {
    if (input.amountMajor < ECO_POINT_LIMITS.WALLET_TOPUP_MIN_PLN) return 0;

    const existing = await db.ecoPointsLedgerEntry.findFirst({
      where: {
        userId: input.userId,
        reason: 'WALLET_TOPUP',
        referenceId: input.walletTxId,
      },
    });
    if (existing) return 0;

    const rawPoints =
      Math.floor(input.amountMajor / ECO_POINT_LIMITS.WALLET_TOPUP_PLN_PER_TIER) *
      ECO_POINT_DELTAS.WALLET_TOPUP_PER_TIER;
    if (rawPoints <= 0) return 0;

    const monthStart = startOfUtcMonth(new Date());
    const agg = await db.ecoPointsLedgerEntry.aggregate({
      where: {
        userId: input.userId,
        reason: 'WALLET_TOPUP',
        createdAt: { gte: monthStart },
      },
      _sum: { delta: true },
    });
    const usedThisMonth = agg._sum.delta ?? 0;
    const remaining = Math.max(0, ECO_POINT_LIMITS.WALLET_TOPUP_MONTHLY_CAP - usedThisMonth);
    const points = Math.min(rawPoints, remaining);
    if (points <= 0) return 0;

    await db.user.update({
      where: { id: input.userId },
      data: { ecoPoints: { increment: points } },
    });
    await db.ecoPointsLedgerEntry.create({
      data: {
        userId: input.userId,
        delta: points,
        reason: 'WALLET_TOPUP',
        referenceId: input.walletTxId,
      },
    });
    return points;
  }

  async awardSubscriptionFirstPaid(db: Db, userId: string, subscriptionId: string): Promise<boolean> {
    return this.awardOnce(db, {
      userId,
      delta: ECO_POINT_DELTAS.SUBSCRIPTION_FIRST_PAID,
      reason: 'SUBSCRIPTION_FIRST_PAID',
      subscriptionId,
    });
  }

  async awardStripeCardLinked(db: Db, userId: string, subscriptionId: string): Promise<boolean> {
    return this.awardOnce(db, {
      userId,
      delta: ECO_POINT_DELTAS.STRIPE_CARD_LINKED,
      reason: 'STRIPE_CARD_LINKED',
      subscriptionId,
    });
  }

  async awardSubscriptionRenewal(
    db: Db,
    input: { userId: string; subscriptionId: string; referenceId: string },
  ): Promise<boolean> {
    return this.awardWithYearlyCap(db, {
      userId: input.userId,
      delta: ECO_POINT_DELTAS.SUBSCRIPTION_RENEWAL,
      reason: 'SUBSCRIPTION_RENEWAL',
      entityId: input.subscriptionId,
      referenceId: input.referenceId,
      yearlyCap: ECO_POINT_LIMITS.SUBSCRIPTION_RENEWAL_YEARLY_CAP,
    });
  }

  async awardDomainFirstPaid(db: Db, userId: string, domainId: string): Promise<boolean> {
    return this.awardOnce(db, {
      userId,
      delta: ECO_POINT_DELTAS.DOMAIN_FIRST_PAID,
      reason: 'DOMAIN_FIRST_PAID',
      subscriptionId: domainId,
    });
  }

  async awardDomainRenewal(
    db: Db,
    input: { userId: string; domainId: string; referenceId: string },
  ): Promise<boolean> {
    return this.awardWithYearlyCap(db, {
      userId: input.userId,
      delta: ECO_POINT_DELTAS.DOMAIN_RENEWAL,
      reason: 'DOMAIN_RENEWAL',
      entityId: input.domainId,
      referenceId: input.referenceId,
      yearlyCap: ECO_POINT_LIMITS.DOMAIN_RENEWAL_YEARLY_CAP,
    });
  }

  async awardEmailVerified(db: Db, userId: string): Promise<boolean> {
    return this.awardOnce(db, {
      userId,
      delta: ECO_POINT_DELTAS.EMAIL_VERIFIED,
      reason: 'EMAIL_VERIFIED',
    });
  }

  async awardBillingProfileComplete(db: Db, userId: string): Promise<boolean> {
    return this.awardOnce(db, {
      userId,
      delta: ECO_POINT_DELTAS.BILLING_PROFILE_COMPLETE,
      reason: 'BILLING_PROFILE_COMPLETE',
    });
  }

  async awardPasskeyRegistered(db: Db, userId: string, credentialId: string): Promise<boolean> {
    return this.awardOnce(db, {
      userId,
      delta: ECO_POINT_DELTAS.PASSKEY_REGISTERED,
      reason: 'PASSKEY_REGISTERED',
      referenceId: credentialId,
    });
  }

  private async awardWithYearlyCap(
    db: Db,
    input: {
      userId: string;
      delta: number;
      reason: string;
      entityId: string;
      referenceId: string;
      yearlyCap: number;
    },
  ): Promise<boolean> {
    const duplicate = await db.ecoPointsLedgerEntry.findFirst({
      where: {
        userId: input.userId,
        reason: input.reason,
        referenceId: input.referenceId,
      },
    });
    if (duplicate) return false;

    const yearStart = startOfUtcYear(new Date());
    const count = await db.ecoPointsLedgerEntry.count({
      where: {
        userId: input.userId,
        reason: input.reason,
        subscriptionId: input.entityId,
        createdAt: { gte: yearStart },
      },
    });
    if (count >= input.yearlyCap) return false;

    await db.user.update({
      where: { id: input.userId },
      data: { ecoPoints: { increment: input.delta } },
    });
    await db.ecoPointsLedgerEntry.create({
      data: {
        userId: input.userId,
        delta: input.delta,
        reason: input.reason,
        subscriptionId: input.entityId,
        referenceId: input.referenceId,
      },
    });
    return true;
  }

  /** Best-effort — nigdy nie przerywa głównego flow. */
  async safeAward(label: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Eco points award skipped (${label}): ${msg}`);
    }
  }
}
