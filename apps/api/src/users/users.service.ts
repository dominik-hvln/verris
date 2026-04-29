import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus, WalletTxType } from '@ekohost/database';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  ApplyReferralCodeDto,
  RedeemEcoPointsDto,
} from './users.dto';

@Injectable()
export class UsersService {
  private static readonly ECO_REDEEM_STEP = 100;
  private static readonly ECO_REDEEM_PLN_PER_STEP = new Prisma.Decimal(10);

  constructor(private prisma: PrismaService) {}

  /**
   * Pobiera pełny profil użytkownika (bez hash'a hasła).
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        companyName: true,
        nip: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        locale: true,
        walletBalance: true,
        ecoPoints: true,
        isTwoFactorEnabled: true,
        createdAt: true,
        referredByUserId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [ecoActiveCount, tokens] = await Promise.all([
      this.prisma.subscription.count({
        where: { userId, status: SubscriptionStatus.ACTIVE, ecoModeEnabled: true },
      }),
      this.ensureReferralAndBadgeTokens(userId),
    ]);

    return {
      ...user,
      hasActiveEcoSubscription: ecoActiveCount > 0,
      referralCode: tokens.referralCode,
      ecoBadgeToken: tokens.ecoBadgeToken,
    };
  }

  /** Uzupełnia brakujące kody (użytkownicy sprzed migracji G). */
  private async ensureReferralAndBadgeTokens(
    userId: string,
  ): Promise<{ referralCode: string; ecoBadgeToken: string }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true, ecoBadgeToken: true },
    });
    if (!u) throw new NotFoundException('User not found');

    if (u.referralCode && u.ecoBadgeToken) {
      return { referralCode: u.referralCode, ecoBadgeToken: u.ecoBadgeToken };
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      const referralCode = u.referralCode ?? `EKO-${randomBytes(4).toString('hex').toUpperCase()}`;
      const ecoBadgeToken = u.ecoBadgeToken ?? randomBytes(18).toString('base64url');
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            ...(u.referralCode ? {} : { referralCode }),
            ...(u.ecoBadgeToken ? {} : { ecoBadgeToken }),
          },
        });
        return { referralCode, ecoBadgeToken };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          continue;
        }
        throw e;
      }
    }
    throw new BadRequestException('Nie udało się nadać unikalnego kodu polecenia — spróbuj ponownie.');
  }

  async listEcoLedger(userId: string, take = 50) {
    return this.prisma.ecoPointsLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        delta: true,
        reason: true,
        subscriptionId: true,
        createdAt: true,
      },
    });
  }

  async applyReferralCode(userId: string, dto: ApplyReferralCodeDto) {
    const normalized = dto.code.trim().toUpperCase();
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me) throw new NotFoundException('User not found');
    if (me.referredByUserId) {
      throw new BadRequestException('To konto ma już przypisane polecenie.');
    }

    const referrer = await this.prisma.user.findFirst({
      where: { referralCode: normalized, NOT: { id: userId } },
    });
    if (!referrer) {
      throw new BadRequestException('Nie znaleziono kodu polecenia.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { referredByUserId: referrer.id, ecoPoints: { increment: 3 } },
      }),
      this.prisma.user.update({
        where: { id: referrer.id },
        data: { ecoPoints: { increment: 5 } },
      }),
      this.prisma.ecoPointsLedgerEntry.createMany({
        data: [
          { userId, delta: 3, reason: 'REFERRAL_APPLIED_REFEREE' },
          { userId: referrer.id, delta: 5, reason: 'REFERRAL_APPLIED_REFERRER' },
        ],
      }),
    ]);

    return { ok: true as const };
  }

  async redeemEcoPoints(userId: string, dto: RedeemEcoPointsDto) {
    const points = Math.trunc(dto.points);
    if (points % UsersService.ECO_REDEEM_STEP !== 0) {
      throw new BadRequestException(
        `Możesz wymienić punkty tylko wielokrotnością ${UsersService.ECO_REDEEM_STEP}.`,
      );
    }

    const steps = points / UsersService.ECO_REDEEM_STEP;
    const creditAmount = UsersService.ECO_REDEEM_PLN_PER_STEP.mul(steps);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, ecoPoints: true, walletBalance: true, walletCurrency: true },
      });
      if (!user) throw new NotFoundException('User not found');
      if (user.ecoPoints < points) {
        throw new BadRequestException('Za mało punktów EKO do tej wymiany.');
      }

      const walletBalanceAfter = new Prisma.Decimal(user.walletBalance).plus(creditAmount);
      const pointsAfter = user.ecoPoints - points;

      await tx.user.update({
        where: { id: userId },
        data: {
          ecoPoints: pointsAfter,
          walletBalance: walletBalanceAfter,
        },
      });

      await tx.ecoPointsLedgerEntry.create({
        data: {
          userId,
          delta: -points,
          reason: 'EKO_REDEEM_WALLET',
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          type: WalletTxType.PROMO_CREDIT,
          amount: creditAmount,
          currency: user.walletCurrency,
          balanceAfter: walletBalanceAfter,
          paymentProvider: 'EKO',
          description: `Wymiana punktów EKO: ${points} pkt`,
          metadata: {
            source: 'eco_points',
            pointsSpent: points,
            step: UsersService.ECO_REDEEM_STEP,
          },
        },
      });

      return { pointsAfter, walletBalanceAfter };
    });

    return {
      ok: true as const,
      pointsSpent: points,
      creditedAmount: creditAmount.toFixed(2),
      pointsAfter: result.pointsAfter,
      walletBalanceAfter: result.walletBalanceAfter.toFixed(2),
    };
  }

  /**
   * Aktualizuje dane profilowe i bilingowe użytkownika.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(dto.nip !== undefined && { nip: dto.nip }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        nip: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
        locale: true,
      },
    });

    return updated;
  }

  /**
   * Zmienia hasło użytkownika po weryfikacji starego hasła.
   * Zwraca komunikat sukcesu (frontend powinien wymusić ponowne logowanie).
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Weryfikacja aktualnego hasła
    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Aktualne hasło jest nieprawidłowe');
    }

    // Hashowanie nowego hasła
    const saltRounds = 10;
    const newHash = await bcrypt.hash(dto.newPassword, saltRounds);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return { message: 'Hasło zostało zmienione pomyślnie' };
  }
}
