import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PromoKind, Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { WalletLedgerService } from './wallet-ledger.service';
import { MailerService } from '../mail/mailer.service';
import { promoCodeRedeemedTemplate } from '../mail/templates/promo-notifications';

@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
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
        'Kody procentowe stosuje się przy doładowaniu portfela — wpisz kod w koszyku doładowania, a bonus zostanie naliczony po zaksięgowaniu wpłaty.',
      );
    }
    if (promo.kind === PromoKind.SERVICE_PERCENT_OFF) {
      throw new BadRequestException(
        'Ten kod rabatowy stosuje się przy zakupie usługi hostingowej — wpisz go w kreatorze nowej usługi.',
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

    void this.notifyPromoRedeemed({
      userId,
      code: promo.code,
      kind: 'FLAT',
      amount,
      description: promo.description,
    }).catch((err) => {
      this.logger.warn(
        `notifyPromoRedeemed (FLAT) failed for user=${userId} promo=${promo.id}: ${
          (err as Error).message
        }`,
      );
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
    appliesToRenewals?: boolean;
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

  // ---------------------------------------------------------------------------
  // Service purchase — percent off first period (and optional renewals)
  // ---------------------------------------------------------------------------

  async previewServicePercentOff(
    userId: string,
    rawCode: string,
    listPrice: Prisma.Decimal,
  ): Promise<{
    promoCodeId: string;
    code: string;
    percent: number;
    listPrice: Prisma.Decimal;
    discountedAmount: Prisma.Decimal;
    savingsAmount: Prisma.Decimal;
    appliesToRenewals: boolean;
    description: string | null;
  }> {
    const promo = await this.resolveActiveServicePercentPromo(userId, rawCode);
    const percent = new Prisma.Decimal(promo.value);
    const discountedAmount = this.applyPercentDiscount(listPrice, percent);
    const savingsAmount = listPrice.minus(discountedAmount).toDecimalPlaces(2);
    return {
      promoCodeId: promo.id,
      code: promo.code,
      percent: percent.toNumber(),
      listPrice,
      discountedAmount,
      savingsAmount,
      appliesToRenewals: promo.appliesToRenewals,
      description: promo.description,
    };
  }

  /**
   * Idempotent per (promo, user). Call after successful provisioning / first charge.
   */
  async recordServicePromoRedemption(input: {
    userId: string;
    promoCodeId: string;
    subscriptionId: string;
    listPrice: Prisma.Decimal;
    chargedAmount: Prisma.Decimal;
  }): Promise<void> {
    const existing = await this.prisma.promoRedemption.findUnique({
      where: {
        promoCodeId_userId: { promoCodeId: input.promoCodeId, userId: input.userId },
      },
    });
    if (existing) return;

    const savings = input.listPrice.minus(input.chargedAmount).toDecimalPlaces(2);
    await this.prisma.promoRedemption.create({
      data: {
        promoCodeId: input.promoCodeId,
        userId: input.userId,
        subscriptionId: input.subscriptionId,
        amountCredited: savings.greaterThan(0) ? savings : new Prisma.Decimal(0),
        currency: 'PLN',
      },
    });
    await this.prisma.promoCode.update({
      where: { id: input.promoCodeId },
      data: { redemptionCount: { increment: 1 } },
    });
    await this.audit.record({
      action: 'PROMO_CODE_REDEEMED',
      userId: input.userId,
      details: {
        promoCodeId: input.promoCodeId,
        subscriptionId: input.subscriptionId,
        kind: 'SERVICE_PERCENT_OFF',
        savingsPln: savings.toFixed(2),
      },
    });
  }

  /** Renewal charge for wallet-managed subscriptions. */
  async resolveSubscriptionRenewalAmount(sub: {
    priceAmount: Prisma.Decimal;
    listPriceAmount: Prisma.Decimal | null;
    appliedPromoCodeId: string | null;
  }): Promise<Prisma.Decimal> {
    const listPrice = sub.listPriceAmount ?? sub.priceAmount;
    if (!sub.appliedPromoCodeId) {
      return listPrice;
    }
    const promo = await this.prisma.promoCode.findUnique({
      where: { id: sub.appliedPromoCodeId },
    });
    if (
      !promo?.active ||
      promo.kind !== PromoKind.SERVICE_PERCENT_OFF ||
      !promo.appliesToRenewals
    ) {
      return listPrice;
    }
    const now = new Date();
    if (promo.validFrom && now < promo.validFrom) return listPrice;
    if (promo.validTo && now > promo.validTo) return listPrice;
    return this.applyPercentDiscount(listPrice, new Prisma.Decimal(promo.value));
  }

  /**
   * BILL-1/BILL-2 — kwota najbliższego odnowienia z uwzględnieniem rabatu
   * startowego. Jedno źródło prawdy dla schedulera obciążeń ORAZ dla maili
   * przypominających, żeby kwota w przypomnieniu zawsze zgadzała się z realnym
   * obciążeniem.
   *
   * Reguła: dopóki zostają okresy rabatu startowego (`introDiscountPeriodsLeft`)
   * odnowienie idzie po cenie listowej pomniejszonej o `introDiscountPct`
   * (rabat startowy NIE łączy się z kodami). Po wyzerowaniu — standardowa logika
   * (cena listowa albo kod z `appliesToRenewals`).
   */
  async resolveNextRenewalAmount(sub: {
    priceAmount: Prisma.Decimal;
    listPriceAmount: Prisma.Decimal | null;
    appliedPromoCodeId: string | null;
    introDiscountPct: number;
    introDiscountPeriodsLeft: number;
  }): Promise<Prisma.Decimal> {
    if (sub.introDiscountPeriodsLeft > 0 && sub.introDiscountPct > 0) {
      const listPrice = sub.listPriceAmount ?? sub.priceAmount;
      return this.applyPercentDiscount(
        listPrice,
        new Prisma.Decimal(sub.introDiscountPct),
      );
    }
    return this.resolveSubscriptionRenewalAmount(sub);
  }

  private applyPercentDiscount(
    listPrice: Prisma.Decimal,
    percent: Prisma.Decimal,
  ): Prisma.Decimal {
    const pct = percent.lessThan(0) ? new Prisma.Decimal(0) : percent;
    const discount = listPrice.times(pct).dividedBy(100);
    const charged = listPrice.minus(discount);
    return charged.lessThanOrEqualTo(0) ? new Prisma.Decimal(0) : charged.toDecimalPlaces(2);
  }

  private async resolveActiveServicePercentPromo(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code.length < 3 || code.length > 40) {
      throw new BadRequestException('Podaj kod promocyjny (3–40 znaków).');
    }
    const promo = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.active) {
      throw new NotFoundException('Nieprawidłowy lub nieaktywny kod promocyjny.');
    }
    if (promo.kind !== PromoKind.SERVICE_PERCENT_OFF) {
      throw new BadRequestException(
        'Ten kod nie jest rabatem na zakup usługi — sprawdź, czy wpisujesz go we właściwym miejscu (portfel vs. nowa usługa).',
      );
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
    return promo;
  }

  // ---------------------------------------------------------------------------
  // Top-up + percent bonus integration (called from BillingService)
  // ---------------------------------------------------------------------------

  /**
   * Validates that a promo code can be applied during wallet top-up checkout.
   * Returns the calculated bonus amount in PLN (always rounded to 2 decimals).
   *
   * Throws `BadRequestException` if the code is invalid, expired, exhausted,
   * already redeemed by this user, or of the wrong kind. Designed for the
   * pre-checkout UI flow ("apply promo code" button) so the user sees the
   * bonus before clicking "Pay".
   */
  async previewPercentBonus(
    userId: string,
    rawCode: string,
    topupAmount: Prisma.Decimal,
  ): Promise<{
    promoCodeId: string;
    code: string;
    percent: number;
    bonusAmount: Prisma.Decimal;
    description: string | null;
  }> {
    const promo = await this.resolveActivePercentPromo(userId, rawCode);
    const percent = new Prisma.Decimal(promo.value);
    if (percent.lessThanOrEqualTo(0) || percent.greaterThan(100)) {
      throw new BadRequestException(
        'Kod ma nieprawidłową wartość procentową — skontaktuj się z supportem.',
      );
    }
    const bonus = topupAmount.times(percent).dividedBy(100).toDecimalPlaces(2);
    return {
      promoCodeId: promo.id,
      code: promo.code,
      percent: percent.toNumber(),
      bonusAmount: bonus,
      description: promo.description,
    };
  }

  /**
   * Applies a previously validated percent bonus AFTER the Stripe top-up has
   * been credited. Idempotent on `promoCodeId + userId + walletTxId`.
   *
   * Called by `BillingService.handleCheckoutCompleted` only when the session
   * metadata contains `promoCodeId` AND the topup credit succeeded.
   */
  async applyPercentBonusForTopup(input: {
    userId: string;
    promoCodeId: string;
    bonusAmount: Prisma.Decimal | string | number;
    relatedWalletTxId: string;
    sessionId: string;
  }): Promise<{ walletTxId: string }> {
    const promo = await this.prisma.promoCode.findUnique({ where: { id: input.promoCodeId } });
    if (!promo || !promo.active || promo.kind !== PromoKind.PERCENT_BONUS) {
      // Best-effort warn but don't blow up — the topup itself succeeded and
      // the user's wallet is already funded. Operator can re-credit manually.
      throw new BadRequestException('Kod promocyjny nieaktywny lub nie istnieje.');
    }

    // Re-check redemption gate (race on multiple checkouts with same code).
    const already = await this.prisma.promoRedemption.findUnique({
      where: { promoCodeId_userId: { promoCodeId: promo.id, userId: input.userId } },
    });
    if (already) {
      // Idempotent: someone else (or earlier webhook delivery) already
      // redeemed this. Return that walletTxId.
      return { walletTxId: already.walletTxId };
    }

    const bonus = new Prisma.Decimal(input.bonusAmount);
    if (bonus.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Bonus nie może być zerowy.');
    }

    const credit = await this.ledger.credit({
      userId: input.userId,
      amount: bonus,
      type: WalletTxType.PROMO_CREDIT,
      description: promo.description ?? `Bonus promocyjny „${promo.code}” do doładowania`,
      idempotencyKey: `promo-pct-bonus:${promo.id}:${input.userId}:${input.sessionId}`,
      paymentProvider: 'PROMO',
      paymentRef: promo.id,
      metadata: {
        promoCodeId: promo.id,
        relatedWalletTxId: input.relatedWalletTxId,
        stripeSessionId: input.sessionId,
        kind: 'PERCENT_BONUS',
      },
    });

    await this.prisma.promoRedemption.create({
      data: {
        promoCodeId: promo.id,
        userId: input.userId,
        amountCredited: bonus,
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
      userId: input.userId,
      details: {
        promoCodeId: promo.id,
        code: promo.code,
        kind: 'PERCENT_BONUS',
        bonusAmount: bonus.toFixed(2),
        walletTxId: credit.id,
        stripeSessionId: input.sessionId,
      },
    });

    void this.notifyPromoRedeemed({
      userId: input.userId,
      code: promo.code,
      kind: 'PERCENT_BONUS',
      amount: bonus,
      description: promo.description,
    }).catch((err) => {
      this.logger.warn(
        `notifyPromoRedeemed (PERCENT_BONUS) failed for user=${input.userId} promo=${promo.id}: ${
          (err as Error).message
        }`,
      );
    });

    return { walletTxId: credit.id };
  }

  private async notifyPromoRedeemed(opts: {
    userId: string;
    code: string;
    kind: 'FLAT' | 'PERCENT_BONUS';
    amount: Prisma.Decimal;
    description: string | null;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: opts.userId },
      select: {
        email: true,
        firstName: true,
        anonymizedAt: true,
        walletBalance: true,
      },
    });
    if (!user || user.anonymizedAt) return;

    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const message = promoCodeRedeemedTemplate({
      to: user.email,
      firstName: user.firstName,
      code: opts.code,
      kind: opts.kind,
      amountPln: opts.amount.toFixed(2),
      description: opts.description,
      walletBalancePln: new Prisma.Decimal(user.walletBalance).toFixed(2),
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'NOREPLY' });
  }

  private async resolveActivePercentPromo(userId: string, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code.length < 3 || code.length > 40) {
      throw new BadRequestException('Podaj kod promocyjny (3–40 znaków).');
    }
    const promo = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.active) {
      throw new NotFoundException('Nieprawidłowy lub nieaktywny kod promocyjny.');
    }
    if (promo.kind !== PromoKind.PERCENT_BONUS) {
      throw new BadRequestException(
        'Ten kod nie jest kodem procentowym do doładowania portfela.',
      );
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
    return promo;
  }
}
