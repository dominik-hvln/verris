import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PromoKind, Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from './wallet-ledger.service';

@Injectable()
export class PromoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly audit: AuditService,
  ) {}

  async redeemPromo(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code.length < 3 || code.length > 40) {
      throw new BadRequestException('Podaj kod promocyjny (3–40 znaków).');
    }

    const promo = await this.prisma.promoCode.findUnique({
      where: { code },
    });
    if (!promo || !promo.active) {
      throw new NotFoundException('Nieprawidłowy lub nieaktywny kod promocyjny.');
    }

    const now = new Date();
    if (promo.validFrom && now < promo.validFrom) {
      throw new BadRequestException('Ten kod nie jest jeszcze aktywny.');
    }
    if (promo.validTo && now > promo.validTo) {
      throw new BadRequestException('Ten kod wygasł.');
    }
    if (promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions) {
      throw new BadRequestException('Ten kod został w pełni wykorzystany.');
    }

    const already = await this.prisma.promoRedemption.findUnique({
      where: { promoCodeId_userId: { promoCodeId: promo.id, userId } },
    });
    if (already) {
      throw new BadRequestException('Już zrealizowałeś ten kod.');
    }

    if (promo.kind === PromoKind.PERCENT_BONUS) {
      throw new BadRequestException(
        'Kody procentowe stosuje się przy doładowaniu portfela — wpisz kod w koszyku doładowania (w przygotowaniu). Na razie użyj kodu stałego (PLN).',
      );
    }

    const amount = new Prisma.Decimal(promo.value);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Niepoprawny kod promocyjny.');
    }

    const credit = await this.ledger.credit({
      userId,
      amount,
      type: WalletTxType.PROMO_CREDIT,
      description: promo.description ?? `Promocja „${promo.code}”`,
      idempotencyKey: `promo-redeem:${promo.id}:${userId}`,
      paymentProvider: 'PROMO',
      paymentRef: promo.id,
      metadata: { promoCodeId: promo.id },
    });

    await this.prisma.promoRedemption.create({
      data: {
        promoCodeId: promo.id,
        userId,
        amountCredited: amount,
        currency: promo.currency,
        walletTxId: credit.id,
      },
    });

    await this.prisma.promoCode.update({
      where: { id: promo.id },
      data: { redemptionCount: { increment: 1 } },
    });

    await this.audit.record({
      action: 'PROMO_CODE_REDEEMED',
      userId,
      details: { promoCodeId: promo.id, code: promo.code, amount: amount.toFixed(2), walletTxId: credit.id },
    });

    return {
      redeemed: true,
      amountPln: amount.toFixed(2),
      walletTxId: credit.id,
      code: promo.code,
    };
  }

  /** Admin helper — REST controller calls this directly. */
  async createPromoCode(input: {
    code: string;
    kind: PromoKind;
    value: Prisma.Decimal | number | string;
    description?: string;
    maxRedemptions?: number | null;
    validFrom?: Date | null;
    validTo?: Date | null;
    actorUserId: string;
  }) {
    const norm = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,40}$/.test(norm)) {
      throw new BadRequestException('Kod: 3–40 znaków [A-Z0-9_-].');
    }
    let validFrom = input.validFrom ?? null;
    let validTo = input.validTo ?? null;
    if (validFrom && Number.isNaN(validFrom.getTime())) {
      throw new BadRequestException('Niepoprawna data validFrom.');
    }
    if (validTo && Number.isNaN(validTo.getTime())) {
      throw new BadRequestException('Niepoprawna data validTo.');
    }
    const value = new Prisma.Decimal(input.value);
    if (value.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Wartość musi być > 0.');
    }

    const created = await this.prisma.promoCode.create({
      data: {
        code: norm,
        kind: input.kind,
        value,
        currency: 'PLN',
        description: input.description ?? null,
        maxRedemptions: input.maxRedemptions ?? null,
        validFrom,
        validTo,
      },
    });

    await this.audit.record({
      action: 'PROMO_CODE_CREATED',
      actorUserId: input.actorUserId,
      details: { promoCodeId: created.id, code: created.code, kind: created.kind },
    });

    return created;
  }

  async listPromoCodes() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
