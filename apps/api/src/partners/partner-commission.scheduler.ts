import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

/**
 * RESELL — naliczanie prowizji partnerskich.
 *
 * Co godzinę:
 *  1) maturacja: PENDING → AVAILABLE gdy minął okres karencji (holdDays),
 *  2) naliczanie: skan realnych płatności klientów (WalletTransaction
 *     CHARGE_SUBSCRIPTION) i utworzenie prowizji % dla poleconych,
 *  3) bonusy: „darmowy hosting za N poleceń" po osiągnięciu progu.
 *
 * Idempotencja: PartnerCommission.dedupeKey (unikat) — „tx:<id>" / „ms:<partner>:<n>".
 */
@Injectable()
export class PartnerCommissionScheduler {
  private readonly logger = new Logger(PartnerCommissionScheduler.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
  ) {}

  private get commissions() {
    return (this.prisma as unknown as {
      partnerCommission: {
        findFirst(a: Record<string, unknown>): Promise<{ id: string } | null>;
        findMany(a: Record<string, unknown>): Promise<Array<{ referredUserId: string | null }>>;
        create(a: { data: Record<string, unknown> }): Promise<{ id: string }>;
        updateMany(a: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
        count(a: Record<string, unknown>): Promise<number>;
      };
    }).partnerCommission;
  }

  @Cron('0 * * * *', { name: 'partner-commission-accrual' })
  async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const cfg = await this.settings.getPartnerProgram();

      // 1) Maturacja prowizji % (bonusy są AVAILABLE od razu).
      const matured = await this.commissions.updateMany({
        where: { status: 'PENDING', availableAt: { lte: new Date() } },
        data: { status: 'AVAILABLE' },
      });
      if (matured.count > 0) this.logger.log(`Dojrzało ${matured.count} prowizji.`);

      if (!cfg.enabled || cfg.commissionPct <= 0) {
        this.busy = false;
        return;
      }

      // 2) Naliczanie % od nowych płatności (okno 3 dni; dedupeKey chroni przed dublami).
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const txs = await this.prisma.walletTransaction.findMany({
        where: { type: WalletTxType.CHARGE_SUBSCRIPTION, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        take: 2000,
        select: { id: true, userId: true, amount: true, currency: true, createdAt: true, subscriptionId: true },
      });

      const affectedPartners = new Set<string>();
      for (const tx of txs) {
        const dedupeKey = `tx:${tx.id}`;
        const exists = await this.commissions.findFirst({ where: { dedupeKey }, select: { id: true } });
        if (exists) continue;

        const payer = await this.prisma.user.findUnique({
          where: { id: tx.userId },
          select: { referredByUserId: true },
        });
        const partnerId = payer?.referredByUserId;
        if (!partnerId) continue;

        const enr = await this.prisma.referralProgramEnrollment.findUnique({
          where: { userId: partnerId },
          select: { status: true },
        });
        if (enr?.status !== 'APPROVED') continue;

        const base = new Prisma.Decimal(tx.amount).abs();
        const amount = base.times(cfg.commissionPct).dividedBy(100).toDecimalPlaces(2);
        if (amount.lessThanOrEqualTo(0)) continue;

        const availableAt = new Date(tx.createdAt.getTime() + cfg.holdDays * 24 * 60 * 60 * 1000);
        try {
          await this.commissions.create({
            data: {
              partnerUserId: partnerId,
              referredUserId: tx.userId,
              kind: 'RECURRING_PCT',
              dedupeKey,
              baseAmount: base,
              pct: cfg.commissionPct,
              amount,
              currency: tx.currency,
              status: 'PENDING',
              availableAt,
              description: `Prowizja ${cfg.commissionPct}% od płatności poleconego klienta`,
            },
          });
          affectedPartners.add(partnerId);
        } catch (err) {
          // P2002 = równoległy dubel po dedupeKey — pomijamy.
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
            this.logger.warn(`Nie udało się naliczyć prowizji tx=${tx.id}: ${(err as Error).message}`);
          }
        }
      }

      // 3) Bonusy „darmowy hosting za N poleceń".
      if (cfg.freeHostingThreshold > 0 && cfg.freeHostingCredit > 0) {
        for (const partnerId of affectedPartners) {
          await this.grantMilestones(partnerId, cfg.freeHostingThreshold, cfg.freeHostingCredit);
        }
      }
    } catch (err) {
      this.logger.error(`partner-commission run failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private async grantMilestones(partnerId: string, threshold: number, credit: number): Promise<void> {
    // Liczba unikalnych, płacących poleceń (mają ≥1 prowizję %).
    const paying = await this.commissions.findMany({
      where: { partnerUserId: partnerId, kind: 'RECURRING_PCT', referredUserId: { not: null } },
      distinct: ['referredUserId'],
      select: { referredUserId: true },
    });
    const earned = Math.floor(paying.length / threshold);
    const already = await this.commissions.count({
      where: { partnerUserId: partnerId, kind: 'MILESTONE_BONUS' },
    });
    for (let k = already + 1; k <= earned; k += 1) {
      const dedupeKey = `ms:${partnerId}:${k}`;
      try {
        await this.commissions.create({
          data: {
            partnerUserId: partnerId,
            kind: 'MILESTONE_BONUS',
            dedupeKey,
            amount: new Prisma.Decimal(credit),
            currency: 'PLN',
            status: 'AVAILABLE',
            availableAt: new Date(),
            description: `Bonus „darmowy hosting" za ${k * threshold} aktywnych poleceń`,
          },
        });
        this.logger.log(`Przyznano bonus partnerowi ${partnerId} (próg #${k}).`);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
          this.logger.warn(`Bonus ${dedupeKey} nieudany: ${(err as Error).message}`);
        }
      }
    }
  }
}
