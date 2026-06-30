import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from '../billing/wallet-ledger.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

// COMMISSION_CREDIT istnieje w schemacie/migracji; generowany klient Prisma
// dostaje go w buildzie prod. W sandboxie rzutujemy string na enum.
const COMMISSION_CREDIT = 'COMMISSION_CREDIT' as WalletTxType;

type CommissionStatus = 'PENDING' | 'AVAILABLE' | 'PAID' | 'CANCELED';
type CommissionKind = 'RECURRING_PCT' | 'MILESTONE_BONUS';
type PayoutMethod = 'WALLET' | 'BANK';
type PayoutStatus = 'REQUESTED' | 'PAID' | 'REJECTED';

interface CommissionRow {
  id: string;
  partnerUserId: string;
  referredUserId: string | null;
  kind: CommissionKind;
  dedupeKey: string;
  baseAmount: Prisma.Decimal | null;
  pct: number | null;
  amount: Prisma.Decimal;
  currency: string;
  status: CommissionStatus;
  availableAt: Date | null;
  payoutId: string | null;
  description: string | null;
  createdAt: Date;
}

interface PayoutRow {
  id: string;
  partnerUserId: string;
  method: PayoutMethod;
  amount: Prisma.Decimal;
  currency: string;
  status: PayoutStatus;
  bankAccount: string | null;
  walletTxId: string | null;
  note: string | null;
  requestedAt: Date;
  processedAt: Date | null;
  processedByUserId: string | null;
}

/** Minimalne delegaty Prisma — klient regenerowany w buildzie prod (Dockerfile.api). */
interface CommissionDelegate {
  findMany(args: Record<string, unknown>): Promise<CommissionRow[]>;
  findFirst(args: Record<string, unknown>): Promise<CommissionRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<CommissionRow>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<CommissionRow>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  aggregate(args: Record<string, unknown>): Promise<{ _sum: { amount: Prisma.Decimal | null } }>;
  count(args: Record<string, unknown>): Promise<number>;
}
interface PayoutDelegate {
  findMany(args: Record<string, unknown>): Promise<PayoutRow[]>;
  findUnique(args: { where: { id: string } }): Promise<PayoutRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<PayoutRow>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<PayoutRow>;
}

export interface PartnerOverview {
  programEnabled: boolean;
  enrollmentStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
  referralCode: string | null;
  referralLink: string | null;
  config: {
    commissionPct: number;
    holdDays: number;
    minPayout: number;
    freeHostingThreshold: number;
    freeHostingCredit: number;
  };
  referrals: { total: number; paying: number };
  earnings: { pending: number; available: number; paid: number; reserved: number };
  milestone: { threshold: number; payingCount: number; achieved: number; nextAt: number | null };
  payout: { canRequestWallet: boolean; canRequestBank: boolean };
}

@Injectable()
export class PartnersService {
  private readonly logger = new Logger(PartnersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly ledger: WalletLedgerService,
    private readonly settings: PlatformSettingsService,
  ) {}

  private get commissions(): CommissionDelegate {
    return (this.prisma as unknown as { partnerCommission: CommissionDelegate }).partnerCommission;
  }
  private get payouts(): PayoutDelegate {
    return (this.prisma as unknown as { partnerPayout: PayoutDelegate }).partnerPayout;
  }

  private clientUrl(): string {
    return (process.env.CLIENT_PANEL_URL ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  private toNum(d: Prisma.Decimal | null | undefined): number {
    return d ? Number(d.toFixed(2)) : 0;
  }

  private async enrollmentStatus(userId: string): Promise<'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'> {
    const e = await this.prisma.referralProgramEnrollment.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (!e) return 'NONE';
    return e.status as 'PENDING' | 'APPROVED' | 'REJECTED';
  }

  private async assertApprovedPartner(userId: string): Promise<void> {
    const status = await this.enrollmentStatus(userId);
    if (status !== 'APPROVED') {
      throw new ForbiddenException('Konto nie jest aktywnym partnerem programu poleceń.');
    }
  }

  private async sumBy(where: Record<string, unknown>): Promise<number> {
    const agg = await this.commissions.aggregate({ where, _sum: { amount: true } });
    return this.toNum(agg._sum.amount);
  }

  // ---------------------------------------------------------------------------
  // Klient (partner)
  // ---------------------------------------------------------------------------

  async getOverview(userId: string): Promise<PartnerOverview> {
    const cfg = await this.settings.getPartnerProgram();
    const status = await this.enrollmentStatus(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    const code = status === 'APPROVED' ? user?.referralCode ?? null : null;

    const totalReferrals = await this.prisma.user.count({ where: { referredByUserId: userId } });
    const payingDistinct = await this.commissions.findMany({
      where: { partnerUserId: userId, kind: 'RECURRING_PCT', referredUserId: { not: null } },
      distinct: ['referredUserId'],
      select: { referredUserId: true },
    });
    const payingCount = payingDistinct.length;

    const pending = await this.sumBy({ partnerUserId: userId, status: 'PENDING' });
    const available = await this.sumBy({ partnerUserId: userId, status: 'AVAILABLE', payoutId: null });
    const reserved = await this.sumBy({ partnerUserId: userId, status: 'AVAILABLE', payoutId: { not: null } });
    const paid = await this.sumBy({ partnerUserId: userId, status: 'PAID' });

    const achieved = await this.commissions.count({
      where: { partnerUserId: userId, kind: 'MILESTONE_BONUS' },
    });
    const nextAt =
      cfg.freeHostingThreshold > 0 ? (achieved + 1) * cfg.freeHostingThreshold : null;

    return {
      programEnabled: cfg.enabled,
      enrollmentStatus: status,
      referralCode: code,
      referralLink: code ? `${this.clientUrl()}/register?ref=${encodeURIComponent(code)}` : null,
      config: {
        commissionPct: cfg.commissionPct,
        holdDays: cfg.holdDays,
        minPayout: cfg.minPayout,
        freeHostingThreshold: cfg.freeHostingThreshold,
        freeHostingCredit: cfg.freeHostingCredit,
      },
      referrals: { total: totalReferrals, paying: payingCount },
      earnings: { pending, available, paid, reserved },
      milestone: {
        threshold: cfg.freeHostingThreshold,
        payingCount,
        achieved,
        nextAt,
      },
      payout: {
        canRequestWallet: status === 'APPROVED' && cfg.enabled && available > 0,
        canRequestBank: status === 'APPROVED' && cfg.enabled && available >= cfg.minPayout,
      },
    };
  }

  async listCommissions(userId: string, limit = 100): Promise<CommissionRow[]> {
    return this.commissions.findMany({
      where: { partnerUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async listMyPayouts(userId: string): Promise<PayoutRow[]> {
    return this.payouts.findMany({
      where: { partnerUserId: userId },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    });
  }

  /** Wypłata do portfela — natychmiastowa (kredyt COMMISSION_CREDIT). */
  async requestWalletPayout(userId: string): Promise<{ amount: number; payoutId: string }> {
    await this.assertApprovedPartner(userId);
    const cfg = await this.settings.getPartnerProgram();
    if (!cfg.enabled) throw new BadRequestException('Program partnerski jest wyłączony.');

    const available = await this.commissions.findMany({
      where: { partnerUserId: userId, status: 'AVAILABLE', payoutId: null },
      select: { id: true, amount: true },
    });
    if (available.length === 0) throw new BadRequestException('Brak dostępnych prowizji do wypłaty.');
    const total = available.reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));
    if (total.lessThanOrEqualTo(0)) throw new BadRequestException('Brak dostępnych prowizji do wypłaty.');

    const payout = await this.payouts.create({
      data: {
        partnerUserId: userId,
        method: 'WALLET',
        amount: total,
        status: 'PAID',
        processedAt: new Date(),
      },
    });

    // Najpierw rezerwujemy prowizje na wypłatę (idempotentnie po payoutId), potem kredyt.
    await this.commissions.updateMany({
      where: { id: { in: available.map((c) => c.id) }, status: 'AVAILABLE', payoutId: null },
      data: { payoutId: payout.id, status: 'PAID' },
    });

    const tx = await this.ledger.credit({
      userId,
      amount: total,
      type: COMMISSION_CREDIT,
      description: 'Wypłata prowizji partnerskiej do portfela',
      idempotencyKey: `partner-payout:${payout.id}`,
      metadata: { payoutId: payout.id, kind: 'PARTNER_COMMISSION' },
    });
    await this.payouts.update({ where: { id: payout.id }, data: { walletTxId: tx.id } });

    await this.audit.record({
      action: 'PARTNER_PAYOUT_WALLET',
      userId,
      details: { payoutId: payout.id, amount: this.toNum(total) },
    });
    return { amount: this.toNum(total), payoutId: payout.id };
  }

  /** Zlecenie wypłaty na konto bankowe — wymaga zatwierdzenia przez admina. */
  async requestBankPayout(userId: string, bankAccount: string): Promise<{ amount: number; payoutId: string }> {
    await this.assertApprovedPartner(userId);
    const cfg = await this.settings.getPartnerProgram();
    if (!cfg.enabled) throw new BadRequestException('Program partnerski jest wyłączony.');

    const iban = (bankAccount ?? '').replace(/\s+/g, '').toUpperCase();
    if (!/^[A-Z0-9]{15,34}$/.test(iban)) {
      throw new BadRequestException('Podaj prawidłowy numer konta (IBAN).');
    }

    const available = await this.commissions.findMany({
      where: { partnerUserId: userId, status: 'AVAILABLE', payoutId: null },
      select: { id: true, amount: true },
    });
    const total = available.reduce((s, c) => s.plus(c.amount), new Prisma.Decimal(0));
    if (total.lessThan(cfg.minPayout)) {
      throw new BadRequestException(`Minimalna kwota wypłaty na konto to ${cfg.minPayout} K.`);
    }

    const payout = await this.payouts.create({
      data: {
        partnerUserId: userId,
        method: 'BANK',
        amount: total,
        status: 'REQUESTED',
        bankAccount: iban,
      },
    });
    // Rezerwujemy prowizje (payoutId), status pozostaje AVAILABLE do czasu wypłaty.
    await this.commissions.updateMany({
      where: { id: { in: available.map((c) => c.id) }, status: 'AVAILABLE', payoutId: null },
      data: { payoutId: payout.id },
    });

    await this.audit.record({
      action: 'PARTNER_PAYOUT_BANK_REQUESTED',
      userId,
      details: { payoutId: payout.id, amount: this.toNum(total) },
    });
    return { amount: this.toNum(total), payoutId: payout.id };
  }

  // ---------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------

  async adminListPayouts(status?: PayoutStatus): Promise<PayoutRow[]> {
    return this.payouts.findMany({
      where: status ? { status } : {},
      orderBy: { requestedAt: 'desc' },
      take: 300,
    });
  }

  async adminProcessPayout(
    payoutId: string,
    action: 'PAID' | 'REJECTED',
    actorUserId: string,
    note?: string,
  ): Promise<PayoutRow> {
    const payout = await this.payouts.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Wypłata nie istnieje.');
    if (payout.method !== 'BANK' || payout.status !== 'REQUESTED') {
      throw new BadRequestException('Tę wypłatę można już tylko przeglądać.');
    }

    if (action === 'PAID') {
      await this.commissions.updateMany({
        where: { payoutId, status: 'AVAILABLE' },
        data: { status: 'PAID' },
      });
      const updated = await this.payouts.update({
        where: { id: payoutId },
        data: { status: 'PAID', processedAt: new Date(), processedByUserId: actorUserId, note: note ?? null },
      });
      await this.audit.record({
        action: 'PARTNER_PAYOUT_PAID',
        userId: actorUserId,
        details: { payoutId, partnerUserId: payout.partnerUserId, amount: this.toNum(payout.amount) },
      });
      return updated;
    }

    // REJECTED — zwalniamy zarezerwowane prowizje z powrotem do puli.
    await this.commissions.updateMany({
      where: { payoutId, status: 'AVAILABLE' },
      data: { payoutId: null },
    });
    const updated = await this.payouts.update({
      where: { id: payoutId },
      data: { status: 'REJECTED', processedAt: new Date(), processedByUserId: actorUserId, note: note ?? null },
    });
    await this.audit.record({
      action: 'PARTNER_PAYOUT_REJECTED',
      userId: actorUserId,
      details: { payoutId, partnerUserId: payout.partnerUserId, note: note ?? null },
    });
    return updated;
  }

  getConfig() {
    return this.settings.getPartnerProgram();
  }

  updateConfig(
    input: {
      enabled: boolean;
      commissionPct: number;
      holdDays: number;
      minPayout: number;
      freeHostingThreshold: number;
      freeHostingCredit: number;
    },
    actorUserId: string,
  ) {
    return this.settings.updatePartnerProgram(input, actorUserId);
  }
}
