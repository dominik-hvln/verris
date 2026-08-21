import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CustomerPermission,
  Prisma,
  SubscriptionStatus,
  WalletTxType,
} from '@verris/database';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { resolveSidebarQuickLinks, isSidebarTileHref } from './sidebar-quick-links';
import {
  UpdateProfileDto,
  ChangePasswordDto,
  ApplyReferralCodeDto,
  RedeemEcoPointsDto,
} from './users.dto';
import { MailerService } from '../mail/mailer.service';
import { passwordChangedTemplate } from '../mail/templates/security-notifications';
import { EcoBadgeService } from './eco-badge.service';
import { EcoPointsService, isBillingProfileComplete } from '../eco/eco-points.service';

@Injectable()
export class UsersService {
  private static readonly ECO_REDEEM_STEP = 100;
  private static readonly ECO_REDEEM_PLN_PER_STEP = new Prisma.Decimal(10);
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly ecoBadge: EcoBadgeService,
    private readonly ecoPoints: EcoPointsService,
  ) {}

  getEcoBadgeStats(userId: string) {
    return this.ecoBadge.getStats(userId);
  }

  async getEcoProgramOverview(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ecoPoints: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const ecoHostingStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PROVISIONING,
      SubscriptionStatus.PAST_DUE,
    ];

    const [ecoModeOnActiveServices, ecoModeOnServices, enrollment] = await Promise.all([
      this.prisma.subscription.count({
        where: {
          userId,
          ecoModeEnabled: true,
          status: { in: ecoHostingStatuses },
        },
      }),
      this.prisma.subscription.count({
        where: {
          userId,
          ecoModeEnabled: true,
          status: { notIn: [SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED] },
        },
      }),
      this.prisma.referralProgramEnrollment.findUnique({
        where: { userId },
        select: { status: true },
      }),
    ]);

    const referralApproved = enrollment?.status === 'APPROVED';

    return {
      ecoPoints: user.ecoPoints,
      ecoModeOnActiveServices,
      ecoModeOnServices,
      hasEcoModeOnActiveService: ecoModeOnActiveServices > 0,
      referralProgramStatus: enrollment?.status ?? null,
      referralProgramApproved: referralApproved,
      /** Uczestnictwo w programie EKO (punkty, hosting eko lub zaakceptowany program partnerski). */
      isEcoProgramParticipant:
        user.ecoPoints > 0 || ecoModeOnServices > 0 || referralApproved,
    };
  }

  /**
   * Pobiera profil sesji: dla subkonta to konto operatora (`principalUserId`),
   * dane rozliczeniowe/EKO właściciela (`accountUserId`) tylko gdy ma uprawnienia.
   */
  async getProfile(accountUserId: string, principalUserId?: string) {
    const profileId = principalUserId ?? accountUserId;
    const user = await this.prisma.user.findUnique({
      where: { id: profileId },
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
        sidebarQuickLinks: true,
        walletBalance: true,
        ecoPoints: true,
        isTwoFactorEnabled: true,
        requireStrongAuth: true,
        createdAt: true,
        referredByUserId: true,
        customerOwnerId: true,
        customerPermissions: true,
        subaccountLabel: true,
        canAccessGrafana: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSubaccount = Boolean(user.customerOwnerId);
    const perms = new Set(user.customerPermissions ?? []);
    const canBilling =
      !isSubaccount ||
      perms.has(CustomerPermission.BILLING_READ) ||
      perms.has(CustomerPermission.BILLING_MANAGE);

    const ecoHostingStatuses: SubscriptionStatus[] = [
      SubscriptionStatus.ACTIVE,
      SubscriptionStatus.PROVISIONING,
      SubscriptionStatus.PAST_DUE,
    ];

    const [ecoActiveCount, enrollment, tokens] = isSubaccount
      ? [0, null, { referralCode: null as string | null, ecoBadgeToken: null as string | null }]
      : await Promise.all([
          this.prisma.subscription.count({
            where: {
              userId: accountUserId,
              ecoModeEnabled: true,
              status: { in: ecoHostingStatuses },
            },
          }),
          this.prisma.referralProgramEnrollment.findUnique({
            where: { userId: accountUserId },
            select: { status: true },
          }),
          this.ensureReferralAndBadgeTokens(accountUserId),
        ]);

    const passkeyCount = await this.prisma.webAuthnCredential.count({
      where: { userId: profileId },
    });
    const referralApproved = enrollment?.status === 'APPROVED';
    const isEcoProgramParticipant = isSubaccount
      ? false
      : user.ecoPoints > 0 || ecoActiveCount > 0 || referralApproved;
    const sidebarQuickLinks = resolveSidebarQuickLinks(user.sidebarQuickLinks);

    return {
      ...user,
      walletBalance: canBilling ? user.walletBalance : null,
      ecoPoints: isSubaccount ? 0 : user.ecoPoints,
      sidebarQuickLinks,
      hasActiveEcoSubscription: isSubaccount ? false : ecoActiveCount > 0,
      isEcoProgramParticipant,
      referralProgramApproved: isSubaccount ? false : referralApproved,
      referralCode: isSubaccount ? null : tokens.referralCode,
      ecoBadgeToken: isSubaccount ? null : tokens.ecoBadgeToken,
      isSubaccount,
      customerPermissions: isSubaccount ? [...perms] : null,
      hasPasskey: passkeyCount > 0,
    };
  }

  /**
   * SEC-6 — włącz/wyłącz wymóg silnego logowania (passkey/2FA) dla konta.
   * Włączyć można TYLKO gdy konto ma już czynnik (2FA lub passkey) — inaczej
   * groziłoby to zablokowaniem dostępu.
   */
  async setStrongAuthRequirement(userId: string, enabled: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isTwoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (enabled) {
      const passkeys = await this.prisma.webAuthnCredential.count({ where: { userId } });
      if (!user.isTwoFactorEnabled && passkeys === 0) {
        throw new BadRequestException(
          'Najpierw włącz 2FA lub dodaj passkey — bez drugiego składnika nie można wymusić silnego logowania.',
        );
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { requireStrongAuth: enabled },
    });
    return { ok: true as const, requireStrongAuth: enabled };
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

    const referrerEnrollment = await this.prisma.referralProgramEnrollment.findUnique({
      where: { userId: referrer.id },
    });
    if (!referrerEnrollment || referrerEnrollment.status !== 'APPROVED') {
      throw new BadRequestException(
        'Ten kod polecenia nie jest jeszcze aktywny — właściciel musi dołączyć do programu partnerskiego.',
      );
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

  async getReferralProgramStatus(userId: string) {
    const [enrollment, user] = await Promise.all([
      this.prisma.referralProgramEnrollment.findUnique({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      }),
    ]);
    if (!user) throw new NotFoundException('User not found');

    const approved = enrollment?.status === 'APPROVED';
    return {
      status: enrollment?.status ?? null,
      appliedAt: enrollment?.appliedAt ?? null,
      reviewedAt: enrollment?.reviewedAt ?? null,
      reviewNote: enrollment?.reviewNote ?? null,
      referralCode: approved ? user.referralCode : null,
    };
  }

  async listReferralEnrollments(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.referralProgramEnrollment.findMany({
      where: status ? { status } : undefined,
      orderBy: { appliedAt: 'desc' },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            referralCode: true,
            ecoPoints: true,
          },
        },
      },
    });
  }

  async reviewReferralEnrollment(
    targetUserId: string,
    input: { status: 'APPROVED' | 'REJECTED'; reviewNote?: string },
    reviewerUserId: string,
  ) {
    const row = await this.prisma.referralProgramEnrollment.findUnique({
      where: { userId: targetUserId },
    });
    if (!row) {
      throw new NotFoundException('Brak zgłoszenia do programu poleceń.');
    }
    if (row.status !== 'PENDING') {
      throw new BadRequestException('To zgłoszenie zostało już rozpatrzone.');
    }

    if (input.status === 'APPROVED') {
      await this.ensureReferralAndBadgeTokens(targetUserId);
    }

    return this.prisma.referralProgramEnrollment.update({
      where: { userId: targetUserId },
      data: {
        status: input.status,
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
        reviewNote: input.reviewNote?.trim() || null,
      },
    });
  }

  async applyReferralProgram(userId: string, termsVersion?: string) {
    const existing = await this.prisma.referralProgramEnrollment.findUnique({
      where: { userId },
    });
    if (existing) {
      throw new BadRequestException('Zgłoszenie do programu poleceń zostało już wysłane.');
    }
    const row = await this.prisma.referralProgramEnrollment.create({
      data: {
        userId,
        termsVersion: termsVersion?.trim() || '1.0',
      },
    });
    return { status: row.status, appliedAt: row.appliedAt };
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
  async updateProfile(
    accountUserId: string,
    dto: UpdateProfileDto,
    principalUserId?: string,
  ) {
    const profileId = principalUserId ?? accountUserId;
    const user = await this.prisma.user.findUnique({
      where: { id: profileId },
      select: {
        id: true,
        customerOwnerId: true,
        companyName: true,
        nip: true,
        address: true,
        city: true,
        postalCode: true,
        country: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSubaccount = Boolean(user.customerOwnerId);
    if (isSubaccount) {
      if (
        dto.companyName !== undefined ||
        dto.nip !== undefined ||
        dto.address !== undefined ||
        dto.city !== undefined ||
        dto.postalCode !== undefined ||
        dto.country !== undefined ||
        dto.sidebarQuickLinks !== undefined
      ) {
        throw new BadRequestException(
          'Subkonto może edytować wyłącznie dane osobowe (imię, nazwisko, język).',
        );
      }
    }

    let sidebarQuickLinks: string[] | undefined;
    if (dto.sidebarQuickLinks !== undefined) {
      const unique = [...new Set(dto.sidebarQuickLinks)];
      if (unique.length !== 4) {
        throw new BadRequestException('Wybierz dokładnie 4 różne skróty w sidebarze.');
      }
      for (const href of unique) {
        if (!isSidebarTileHref(href)) {
          throw new BadRequestException(`Niedozwolony skrót panelu: ${href}`);
        }
      }
      sidebarQuickLinks = unique;
    }

    const updated = await this.prisma.user.update({
      where: { id: profileId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(!isSubaccount && dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(!isSubaccount && dto.nip !== undefined && { nip: dto.nip }),
        ...(!isSubaccount && dto.address !== undefined && { address: dto.address }),
        ...(!isSubaccount && dto.city !== undefined && { city: dto.city }),
        ...(!isSubaccount && dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(!isSubaccount && dto.country !== undefined && { country: dto.country }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
        ...(!isSubaccount && sidebarQuickLinks !== undefined && { sidebarQuickLinks }),
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
        sidebarQuickLinks: true,
      },
    });

    if (
      !isSubaccount &&
      !isBillingProfileComplete(user) &&
      isBillingProfileComplete(updated)
    ) {
      void this.ecoPoints.safeAward(`billing_profile:${profileId}`, async () => {
        await this.ecoPoints.awardBillingProfileComplete(this.prisma, profileId);
      });
    }

    return {
      ...updated,
      sidebarQuickLinks: resolveSidebarQuickLinks(updated.sidebarQuickLinks),
    };
  }

  /**
   * Zmienia hasło użytkownika po weryfikacji starego hasła.
   * Zwraca komunikat sukcesu (frontend powinien wymusić ponowne logowanie).
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ctx: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
  ) {
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

    void this.notifyPasswordChanged({
      to: user.email,
      firstName: user.firstName,
      changedAt: new Date(),
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    }).catch((err) => {
      this.logger.warn(
        `notifyPasswordChanged failed for user=${userId}: ${(err as Error).message}`,
      );
    });

    return { message: 'Hasło zostało zmienione pomyślnie' };
  }

  /**
   * SEC-7 — historia logowań dla zalogowanego użytkownika (self-service).
   * Zwraca ostatnie pomyślne logowania (LoginEvent) z bezpiecznymi polami —
   * BEZ deviceFingerprint (wewnętrzny hash). Pozwala klientowi zauważyć obce
   * logowanie i zareagować (zmiana hasła / passkey).
   */
  async listMyLoginHistory(userId: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const events = await this.prisma.loginEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        ipAddress: true,
        userAgent: true,
        countryCode: true,
        isNewDevice: true,
        loginMethod: true,
      },
    });
    return {
      events: events.map((e) => ({
        id: e.id,
        at: e.createdAt.toISOString(),
        ipAddress: e.ipAddress,
        device: this.parseDeviceLabel(e.userAgent),
        countryCode: e.countryCode,
        isNewDevice: e.isNewDevice,
        loginMethod: e.loginMethod,
      })),
    };
  }

  /**
   * SEC-8 — dziennik aktywności konta widoczny dla klienta (transparentność +
   * RODO). Zwraca ostatnie, ISTOTNE DLA KLIENTA wpisy audytu dotyczące jego
   * konta (jako cel lub wykonawca), z bezpiecznym, krótkim kontekstem.
   */
  async listMyActivity(userId: string, limit = 30) {
    const VISIBLE = new Set<string>([
      'HOSTING_DB_CREATED',
      'HOSTING_DB_DELETED',
      'HOSTING_FTP_CREATED',
      'HOSTING_FTP_DELETED',
      'HOSTING_EMAIL_CREATED',
      'HOSTING_EMAIL_DELETED',
      'HOSTING_EMAIL_PASSWORD_CHANGED',
      'HOSTING_CRON_CREATED',
      'HOSTING_CRON_DELETED',
      'HOSTING_FILE_DELETED',
      'HOSTING_FILE_RENAMED',
      'HOSTING_FILE_UPLOADED',
      'HOSTING_SUBDOMAIN_CREATED',
      'HOSTING_SUBDOMAIN_DELETED',
    ]);
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: { in: [...VISIBLE] },
        OR: [{ userId }, { actorUserId: userId }],
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, action: true, details: true, createdAt: true },
    });
    const ctxOf = (d: unknown): string | null => {
      if (!d || typeof d !== 'object') return null;
      const o = d as Record<string, unknown>;
      for (const k of ['email', 'domain', 'name', 'path', 'command', 'database', 'user']) {
        const v = o[k];
        if (typeof v === 'string' && v.trim()) return v.length > 80 ? `${v.slice(0, 80)}…` : v;
      }
      return null;
    };
    return {
      events: rows.map((r) => ({
        id: r.id,
        action: r.action,
        at: r.createdAt.toISOString(),
        context: ctxOf(r.details),
      })),
    };
  }

  private async notifyPasswordChanged(opts: {
    to: string;
    firstName: string | null;
    changedAt: Date;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const message = passwordChangedTemplate({
      to: opts.to,
      firstName: opts.firstName,
      changedAt: opts.changedAt,
      deviceLabel: this.parseDeviceLabel(opts.userAgent),
      ipAddress: opts.ip,
      panelUrl,
    });
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'NOREPLY' });
  }

  private parseDeviceLabel(ua: string | null): string | null {
    if (!ua) return null;
    const browser = /(Edg|Chrome|Firefox|Safari|Opera)\/[\d.]+/.exec(ua)?.[1];
    const os = /\((Windows|Macintosh|iPhone|iPad|Android|Linux)[^)]*\)/.exec(ua)?.[1];
    if (!browser && !os) return null;
    return [browser, os].filter(Boolean).join(' on ');
  }
}

// `createHash` exposed via crypto import above keeps tree-shake aware (used
// only for parseDeviceLabel; kept import for future device-fingerprinting).
void createHash;
