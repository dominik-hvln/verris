import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { czescNarzutu } from '../reseller/narzut-resellera.js';

/**
 * RESELL — naliczanie prowizji partnerskich.
 *
 * Co godzinę:
 *  1) maturacja: PENDING → AVAILABLE gdy minął okres karencji (holdDays),
 *  2) naliczanie: skan realnych płatności klientów (WalletTransaction
 *     CHARGE_SUBSCRIPTION) i utworzenie prowizji % dla poleconych,
 *  3) bonusy: „darmowy hosting za N poleceń" po osiągnięciu progu,
 *  4) O-07 — narzut resellera zawarty w opłatach jego klientów (RESELLER_MARKUP);
 *     niezależnie od tego, czy program poleceń jest włączony.
 *
 * Idempotencja: PartnerCommission.dedupeKey (unikat) — „tx:<id>" / „ms:<partner>:<n>" / „rsl:<id>".
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

      // 1) Maturacja prowizji % (bonusy są AVAILABLE od razu). Najpierw zwroty z karencji.
      await this.uwzglednijZwroty();
      const matured = await this.commissions.updateMany({
        where: { status: 'PENDING', availableAt: { lte: new Date() } },
        data: { status: 'AVAILABLE' },
      });
      if (matured.count > 0) this.logger.log(`Dojrzało ${matured.count} prowizji.`);

      await this.naliczNarzutyResellerow(cfg.holdDays);

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

        const base = await this.podstawaPoZwrotach(tx);
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

  /**
   * O-07 — prowizja resellera = część opłaty klienta przypadająca na narzut: kwota × pct / (100 + pct).
   * Procent bierzemy ze snapshotu na usłudze (cena, którą klient faktycznie płaci), nie z bieżącego
   * profilu resellera. Usługi z ceną indywidualną (PB-27) płacą cenę operatora — bez narzutu.
   */
  private async naliczNarzutyResellerow(holdDays: number): Promise<void> {
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const txs = await this.prisma.walletTransaction.findMany({
      where: {
        type: WalletTxType.CHARGE_SUBSCRIPTION,
        createdAt: { gte: since },
        subscription: { resellerMarkupPct: { gt: 0 }, individualPrice: null },
      },
      orderBy: { createdAt: 'asc' },
      take: 2000,
      select: { id: true, userId: true, amount: true, currency: true, createdAt: true, subscriptionId: true, subscription: { select: { resellerMarkupPct: true } } },
    });
    for (const tx of txs) {
      const pct = tx.subscription?.resellerMarkupPct ?? 0;
      const dedupeKey = `rsl:${tx.id}`;
      const exists = await this.commissions.findFirst({ where: { dedupeKey }, select: { id: true } });
      if (exists) continue;
      const klient = await this.prisma.user.findUnique({ where: { id: tx.userId }, select: { resellerOwnerId: true } });
      if (!klient?.resellerOwnerId) continue;
      const base = await this.podstawaPoZwrotach(tx);
      const amount = czescNarzutu(base, pct);
      if (amount.lessThanOrEqualTo(0)) continue;
      try {
        await this.commissions.create({
          data: {
            partnerUserId: klient.resellerOwnerId,
            referredUserId: tx.userId,
            kind: 'RESELLER_MARKUP',
            dedupeKey,
            baseAmount: base,
            pct,
            amount,
            currency: tx.currency,
            status: 'PENDING',
            availableAt: new Date(tx.createdAt.getTime() + holdDays * 24 * 60 * 60 * 1000),
            description: `Narzut ${pct}% w płatności Twojego klienta`,
          },
        });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
          this.logger.warn(`Nie udało się naliczyć narzutu resellera tx=${tx.id}: ${(err as Error).message}`);
        }
      }
    }
  }

  /**
   * Opłata pomniejszona o to, co klient dostał z powrotem: zwroty (REFUND) na tę usługę zapisane po opłacie,
   * minus późniejsze obciążenia tej usługi (zwrot za nieudane wznowienie czy zmianę planu oddaje tamtą
   * opłatę, nie tę). Na t1 07.10: zakup poczty bez wolnego węzła → automatyczny zwrot, a prowizja zostawała.
   * ponytail: zwroty liczone per usługa, nie per opłata — przy dwóch opłatach w karencji i jednym zwrocie
   * pomniejszą obie; powiązanie zwrotu z opłatą (kolumna w księdze), jeśli to wyjdzie w praktyce.
   */
  private async podstawaPoZwrotach(tx: { amount: Prisma.Decimal; subscriptionId: string | null; createdAt: Date }): Promise<Prisma.Decimal> {
    const base = new Prisma.Decimal(tx.amount).abs();
    if (!tx.subscriptionId) return base;
    const po = { subscriptionId: tx.subscriptionId, createdAt: { gt: tx.createdAt } };
    const [zwroty, obciazenia] = await Promise.all([
      this.prisma.walletTransaction.aggregate({ where: { ...po, type: WalletTxType.REFUND }, _sum: { amount: true } }),
      this.prisma.walletTransaction.aggregate({ where: { ...po, type: { in: [WalletTxType.CHARGE_SUBSCRIPTION, WalletTxType.CHARGE_PLAN_UPGRADE] } }, _sum: { amount: true } }),
    ]);
    const oddane = new Prisma.Decimal(zwroty._sum.amount ?? 0).abs().minus(new Prisma.Decimal(obciazenia._sum.amount ?? 0).abs());
    const netto = oddane.greaterThan(0) ? base.minus(oddane) : base;
    return netto.greaterThan(0) ? netto : new Prisma.Decimal(0);
  }

  /** Prowizje w karencji od opłat, które potem zwróciliśmy: całość zwrócona → CANCELED, część → mniejsza kwota. */
  private async uwzglednijZwroty(): Promise<void> {
    const wKarencji = await this.prisma.partnerCommission.findMany({
      where: { status: 'PENDING', kind: { in: ['RECURRING_PCT', 'RESELLER_MARKUP'] } },
      select: { id: true, dedupeKey: true, baseAmount: true, amount: true },
    });
    for (const k of wKarencji) {
      const txId = k.dedupeKey.replace(/^(tx|rsl):/, '');
      const tx = await this.prisma.walletTransaction.findUnique({ where: { id: txId }, select: { amount: true, subscriptionId: true, createdAt: true } });
      if (!tx || k.baseAmount == null) continue;
      const netto = await this.podstawaPoZwrotach(tx);
      if (netto.greaterThanOrEqualTo(k.baseAmount)) continue;
      await this.prisma.partnerCommission.updateMany({
        where: { id: k.id, status: 'PENDING' },
        data: netto.lessThanOrEqualTo(0)
          ? { status: 'CANCELED' }
          : { baseAmount: netto, amount: new Prisma.Decimal(k.amount).mul(netto).div(k.baseAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) },
      });
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
