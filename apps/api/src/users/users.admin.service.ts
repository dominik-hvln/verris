import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { Prisma, Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AdminCustomerActions } from '../common/audit/audit.actions';
import { StatusService } from '../status/status.service';
import { StripeService } from '../billing/stripe/stripe.service';
import { MailerService } from '../mail/mailer.service';
import { passwordChangedTemplate } from '../mail/templates/security-notifications';

export interface AdminUserListOptions {
  search?: string;
  role?: Role;
  limit?: number;
  offset?: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: Role;
  walletBalance: string;
  createdAt: string;
  isTwoFactorEnabled: boolean;
  subscriptionsCount: number;
  lastLoginAt: string | null;
  loginBlocked: boolean;
  canAccessGrafana: boolean;
}

export interface ImpersonationContext {
  /** The actual logged-in admin/staff member who issued the impersonation. */
  actorUserId: string;
  actorRole: Role;
  /** When >0 we are *already* impersonating someone; deny rather than chain. */
  alreadyImpersonating?: string | null;
}

@Injectable()
export class UsersAdminService {
  private readonly logger = new Logger(UsersAdminService.name);
  /** Impersonation tokens are short-lived — caps blast radius if leaked. */
  private readonly impersonationTtl = '30m';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly statusService: StatusService,
    private readonly stripe: StripeService,
    private readonly mailer: MailerService,
  ) {}

  // ---------------------------------------------------------------------------
  // Listing / search
  // ---------------------------------------------------------------------------

  async list(opts: AdminUserListOptions = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
    const offset = Math.max(opts.offset ?? 0, 0);

    const where: Prisma.UserWhereInput = {};
    if (opts.role) where.role = opts.role;
    if (opts.search) {
      const term = opts.search.trim();
      if (term.length > 0) {
        where.OR = [
          { email: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
        ];
      }
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { _count: { select: { subscriptions: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    // Last successful login per user on this page (single grouped query — no N+1).
    const lastLoginByUser = new Map<string, Date>();
    if (rows.length > 0) {
      const grouped = await this.prisma.loginEvent.groupBy({
        by: ['userId'],
        where: { userId: { in: rows.map((u) => u.id) } },
        _max: { createdAt: true },
      });
      for (const g of grouped) {
        if (g._max.createdAt) lastLoginByUser.set(g.userId, g._max.createdAt);
      }
    }

    return {
      total,
      limit,
      offset,
      rows: rows.map<AdminUserRow>((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        walletBalance: u.walletBalance.toString(),
        createdAt: u.createdAt.toISOString(),
        isTwoFactorEnabled: u.isTwoFactorEnabled,
        subscriptionsCount: u._count.subscriptions,
        lastLoginAt: lastLoginByUser.get(u.id)?.toISOString() ?? null,
        loginBlocked: u.loginBlocked,
        canAccessGrafana: u.canAccessGrafana,
      })),
    };
  }

  /**
   * Sprint 3 / R-01 — profil klienta 360° dla staff i admina (read-only).
   * STAFF może tylko USER; ADMIN widzi każdego.
   */
  async getCustomer360(
    targetUserId: string,
    actor: { actorUserId: string; actorRole: Role },
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        companyName: true,
        nip: true,
        role: true,
        walletBalance: true,
        walletCurrency: true,
        createdAt: true,
        isTwoFactorEnabled: true,
        stripeCustomerId: true,
        anonymizedAt: true,
        deletionRequestedAt: true,
        loginBlocked: true,
        loginBlockedReason: true,
        adminInternalNote: true,
        canAccessGrafana: true,
      },
    });
    if (!target) throw new NotFoundException('Użytkownik nie istnieje.');
    if (target.anonymizedAt) {
      throw new NotFoundException('Konto zostało zanonimizowane.');
    }

    if (actor.actorRole === Role.STAFF && target.role !== Role.USER) {
      throw new ForbiddenException(
        'Personel może przeglądać wyłącznie profile klientów (USER).',
      );
    }

    const [
      subscriptions,
      recentTickets,
      domains,
      walletLedger,
      recentInvoices,
      paymentMethods,
      auditTrail,
    ] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          plan: { select: { id: true, name: true, slug: true } },
          account: {
            select: {
              id: true,
              domain: true,
              daUsername: true,
              status: true,
              server: {
                select: { id: true, name: true, ipAddress: true, hostname: true },
              },
            },
          },
        },
      }),
      this.prisma.ticket.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          subject: true,
          status: true,
          priority: true,
          department: true,
          createdAt: true,
          _count: { select: { replies: true } },
        },
      }),
      this.prisma.domain.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, name: true, status: true },
      }),
      this.prisma.walletTransaction.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          balanceAfter: true,
          description: true,
          paymentProvider: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          number: true,
          status: true,
          amount: true,
          currency: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      this.prisma.paymentMethod.findMany({
        where: { userId: targetUserId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        select: {
          id: true,
          provider: true,
          brand: true,
          last4: true,
          expMonth: true,
          expYear: true,
          isDefault: true,
        },
      }),
      this.prisma.auditLog.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: {
          id: true,
          action: true,
          details: true,
          actorUserId: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    const serverIds = Array.from(
      new Set(
        subscriptions
          .map((s) => s.account?.server?.id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0),
      ),
    );
    const openIncidents =
      serverIds.length > 0
        ? await this.statusService.findOpenIncidentsForServers(serverIds)
        : [];
    const customerTimeline = buildCustomerTimeline({
      tickets: recentTickets,
      invoices: recentInvoices,
      wallet: walletLedger,
      audit: auditTrail,
    });
    const supportInsights = buildSupportInsights({
      target,
      subscriptions,
      recentTickets,
      openIncidents,
    });

    return {
      user: {
        id: target.id,
        email: target.email,
        firstName: target.firstName,
        lastName: target.lastName,
        companyName: target.companyName,
        nip: target.nip,
        role: target.role,
        walletBalance: target.walletBalance.toString(),
        walletCurrency: target.walletCurrency,
        createdAt: target.createdAt.toISOString(),
        isTwoFactorEnabled: target.isTwoFactorEnabled,
        stripeCustomerId: target.stripeCustomerId,
        deletionRequestedAt: target.deletionRequestedAt?.toISOString() ?? null,
        loginBlocked: target.loginBlocked,
        loginBlockedReason: target.loginBlockedReason,
        adminInternalNote:
          actor.actorRole === Role.ADMIN ? target.adminInternalNote : null,
        canAccessGrafana: target.canAccessGrafana,
      },
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        status: s.status,
        interval: s.interval,
        paymentSource: s.paymentSource,
        priceAmount: s.priceAmount.toString(),
        currency: s.currency,
        currentPeriodStart: s.currentPeriodStart?.toISOString() ?? null,
        currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null,
        cancelAt: s.cancelAt?.toISOString() ?? null,
        autoscalingEnabled: s.autoscalingEnabled,
        plan: s.plan,
        account: s.account
          ? {
              id: s.account.id,
              domain: s.account.domain,
              daUsername: s.account.daUsername,
              status: s.account.status,
              server: s.account.server
                ? {
                    id: s.account.server.id,
                    name: s.account.server.name,
                    ipAddress: s.account.server.ipAddress,
                    hostname: s.account.server.hostname,
                  }
                : null,
            }
          : null,
      })),
      recentTickets: recentTickets.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        department: t.department,
        createdAt: t.createdAt.toISOString(),
        replyCount: t._count.replies,
      })),
      domains: domains.map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
      })),
      walletLedger: walletLedger.map((w) => ({
        id: w.id,
        type: w.type,
        status: w.status,
        amount: w.amount.toString(),
        currency: w.currency,
        balanceAfter: w.balanceAfter.toString(),
        description: w.description,
        paymentProvider: w.paymentProvider,
        createdAt: w.createdAt.toISOString(),
      })),
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount: inv.amount.toString(),
        currency: inv.currency,
        paidAt: inv.paidAt?.toISOString() ?? null,
        createdAt: inv.createdAt.toISOString(),
      })),
      paymentMethods,
      auditTrail: auditTrail.map((a) => ({
        id: a.id,
        action: a.action,
        details: a.details,
        actorUserId: a.actorUserId,
        ipAddress: a.ipAddress,
        createdAt: a.createdAt.toISOString(),
      })),
      statusPageOpenIncidents: openIncidents,
      customerTimeline,
      supportInsights,
    };
  }

  // ---------------------------------------------------------------------------
  // Sprint 4 / R-04 — operacje admina na koncie klienta (USER)
  // ---------------------------------------------------------------------------

  async getCustomerOperationalDetail(userId: string) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        walletBalance: true,
        walletCurrency: true,
        stripeCustomerId: true,
        isTwoFactorEnabled: true,
        loginBlocked: true,
        loginBlockedReason: true,
        adminInternalNote: true,
        createdAt: true,
        anonymizedAt: true,
        deletionRequestedAt: true,
        _count: { select: { subscriptions: true } },
      },
    });
    if (!u) throw new NotFoundException('Użytkownik nie istnieje.');
    if (u.anonymizedAt) {
      throw new NotFoundException('Konto zostało zanonimizowane.');
    }
    if (u.role !== Role.USER) {
      throw new BadRequestException('Szczegóły operacyjne są tylko dla kont klienta (USER).');
    }
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      walletBalance: u.walletBalance.toString(),
      walletCurrency: u.walletCurrency,
      stripeCustomerId: u.stripeCustomerId,
      isTwoFactorEnabled: u.isTwoFactorEnabled,
      loginBlocked: u.loginBlocked,
      loginBlockedReason: u.loginBlockedReason,
      adminInternalNote: u.adminInternalNote,
      createdAt: u.createdAt.toISOString(),
      deletionRequestedAt: u.deletionRequestedAt?.toISOString() ?? null,
      subscriptionsCount: u._count.subscriptions,
    };
  }

  async patchCustomerOperational(
    userId: string,
    actorUserId: string,
    dto: {
      loginBlocked?: boolean;
      loginBlockedReason?: string | null;
      adminInternalNote?: string | null;
    },
    ctx: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    await this.requireEndUserForAdminOps(userId);
    if (
      dto.loginBlocked === undefined &&
      dto.loginBlockedReason === undefined &&
      dto.adminInternalNote === undefined
    ) {
      throw new BadRequestException('Podaj co najmniej jedno pole do aktualizacji.');
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.loginBlocked !== undefined) data.loginBlocked = dto.loginBlocked;
    if (dto.loginBlockedReason !== undefined) {
      data.loginBlockedReason = dto.loginBlockedReason;
    }
    if (dto.adminInternalNote !== undefined) {
      data.adminInternalNote = dto.adminInternalNote;
    }

    await this.prisma.user.update({ where: { id: userId }, data });

    if (dto.loginBlocked !== undefined || dto.loginBlockedReason !== undefined) {
      await this.audit.record({
        action: AdminCustomerActions.CUSTOMER_LOGIN_BLOCK_UPDATED,
        userId,
        actorUserId,
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
        details: {
          loginBlocked: dto.loginBlocked ?? null,
          loginBlockedReason: dto.loginBlockedReason ?? null,
        },
      });
    }
    if (dto.adminInternalNote !== undefined) {
      await this.audit.record({
        action: AdminCustomerActions.CUSTOMER_INTERNAL_NOTE_UPDATED,
        userId,
        actorUserId,
        ipAddress: ctx.ipAddress ?? undefined,
        userAgent: ctx.userAgent ?? undefined,
        details: { lengthChars: dto.adminInternalNote?.length ?? 0 },
      });
    }

    return { ok: true };
  }

  /**
   * Sprint 4 / A-10 — toggle `canAccessGrafana` w UI admina (zastępuje ręczny SQL).
   * Flaga ma sens tylko dla STAFF (ADMIN ma zawsze rolę Admin w Grafanie).
   */
  async setGrafanaAccess(
    userId: string,
    actorUserId: string,
    enabled: boolean,
    reason: string | undefined,
    ctx: { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ ok: true; canAccessGrafana: boolean }> {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, canAccessGrafana: true, anonymizedAt: true, email: true },
    });
    if (!u) throw new NotFoundException('Użytkownik nie istnieje.');
    if (u.anonymizedAt) throw new BadRequestException('Konto zanonimizowane.');
    if (u.role === Role.USER) {
      throw new BadRequestException(
        'Flaga Grafana ma sens tylko dla operatorów (STAFF). ADMIN ma dostęp domyślnie.',
      );
    }
    if (u.canAccessGrafana === enabled) {
      return { ok: true, canAccessGrafana: enabled };
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { canAccessGrafana: enabled },
    });
    await this.audit.record({
      action: AdminCustomerActions.CUSTOMER_GRAFANA_ACCESS_TOGGLED,
      userId,
      actorUserId,
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      details: {
        from: u.canAccessGrafana,
        to: enabled,
        targetEmail: u.email,
        targetRole: u.role,
        reason: reason ?? null,
      },
    });
    return { ok: true, canAccessGrafana: enabled };
  }

  async changeCustomerEmail(
    userId: string,
    actorUserId: string,
    newEmail: string,
    reason: string | undefined,
    ctx: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const prev = await this.requireEndUserForAdminOps(userId);
    const normalized = newEmail.trim().toLowerCase();
    if (normalized === prev.email.toLowerCase()) {
      throw new BadRequestException('Nowy adres jest taki sam jak obecny.');
    }
    const taken = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    });
    if (taken) {
      throw new ConflictException('Ten adres e-mail jest już przypisany do innego konta.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { email: normalized },
    });

    if (this.stripe.isConfigured() && prev.stripeCustomerId) {
      try {
        await this.stripe.updateCustomerEmail(prev.stripeCustomerId, normalized);
      } catch (e) {
        this.logger.warn(
          `Stripe updateCustomerEmail failed for ${prev.stripeCustomerId}: ${(e as Error).message}`,
        );
      }
    }

    await this.audit.record({
      action: AdminCustomerActions.CUSTOMER_EMAIL_CHANGED,
      userId,
      actorUserId,
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      details: {
        fromEmail: prev.email,
        toEmail: normalized,
        reason: reason ?? null,
      },
    });

    return { ok: true, email: normalized };
  }

  async resetCustomerPassword(
    userId: string,
    actorUserId: string,
    dto: { notifyUser?: boolean; reason?: string | undefined },
    ctx: { ipAddress?: string | null; userAgent?: string | null },
  ) {
    const prev = await this.requireEndUserForAdminOps(userId);
    const temporaryPassword = `${randomBytes(10).toString('base64url')}Aa1!`;
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        twoFactorSecret: null,
        isTwoFactorEnabled: false,
        twoFactorEnrolledAt: null,
        twoFactorRecoveryCodesEnc: null,
      },
    });

    await this.audit.record({
      action: AdminCustomerActions.CUSTOMER_PASSWORD_RESET_BY_ADMIN,
      userId,
      actorUserId,
      ipAddress: ctx.ipAddress ?? undefined,
      userAgent: ctx.userAgent ?? undefined,
      details: {
        notifyUser: dto.notifyUser === true,
        reason: dto.reason ?? null,
      },
    });

    if (dto.notifyUser === true) {
      const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
      const message = passwordChangedTemplate({
        to: prev.email,
        firstName: prev.firstName,
        changedAt: new Date(),
        deviceLabel: 'Panel administratora Verris',
        ipAddress: ctx.ipAddress ?? null,
        panelUrl,
      });
      void this.mailer
        .send({ ...message, category: 'TRANSACTIONAL', fromRole: 'SECURITY' })
        .catch((err) => {
        this.logger.warn(`password reset notify mail failed: ${(err as Error).message}`);
      });
    }

    return { temporaryPassword };
  }

  private async requireEndUserForAdminOps(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('Użytkownik nie istnieje.');
    if (u.anonymizedAt) {
      throw new NotFoundException('Konto zostało zanonimizowane.');
    }
    if (u.role !== Role.USER) {
      throw new ForbiddenException(
        'Tej operacji można dokonać wyłącznie na koncie klienta (USER).',
      );
    }
    return u;
  }

  // ---------------------------------------------------------------------------
  // Impersonation
  // ---------------------------------------------------------------------------

  /**
   * Mints a short-lived JWT bound to `targetUserId` while preserving the
   * original actor's identity in the `actorUserId` / `impersonatedBy` claims.
   * The JwtStrategy and audit middleware will surface those claims to the
   * panels so the support agent always knows whose session they're running.
   */
  async impersonate(opts: {
    targetUserId: string;
    ctx: ImpersonationContext;
    ipAddress?: string | null;
    userAgent?: string | null;
    reason?: string | null;
  }) {
    if (opts.ctx.alreadyImpersonating) {
      throw new ForbiddenException(
        'Cannot impersonate while already impersonating another user.',
      );
    }
    if (opts.ctx.actorRole !== Role.ADMIN && opts.ctx.actorRole !== Role.STAFF) {
      throw new ForbiddenException('Only ADMIN or STAFF can impersonate users.');
    }
    if (opts.targetUserId === opts.ctx.actorUserId) {
      throw new BadRequestException('Cannot impersonate yourself.');
    }
    // Sprint 6 — wymagamy uzasadnienia każdej sesji impersonacji (RODO + audit).
    const reason = opts.reason?.trim();
    if (!reason || reason.length < 10) {
      throw new BadRequestException(
        'Powód impersonacji jest wymagany (min. 10 znaków). Pojawi się w audicie i powiadomieniu klienta.',
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: opts.targetUserId },
    });
    if (!target) throw new NotFoundException('Target user not found');

    // Hard rule: only ADMIN can impersonate other ADMIN/STAFF accounts. STAFF
    // is restricted to USER accounts to limit privilege escalation paths.
    if (opts.ctx.actorRole === Role.STAFF && target.role !== Role.USER) {
      throw new ForbiddenException(
        'Staff accounts may only impersonate end-user accounts.',
      );
    }

    const issuedAt = Math.floor(Date.now() / 1000);
    const token = this.jwt.sign(
      {
        sub: target.id,
        email: target.email,
        role: target.role,
        purpose: 'access',
        actorUserId: opts.ctx.actorUserId,
        impersonatedBy: opts.ctx.actorUserId,
        impersonationStartedAt: issuedAt,
        impersonationReason: reason,
      },
      { expiresIn: this.impersonationTtl },
    );

    await this.audit.record({
      action: 'USER_IMPERSONATION_STARTED',
      userId: target.id,
      actorUserId: opts.ctx.actorUserId,
      impersonatedBy: opts.ctx.actorUserId,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      details: {
        targetEmail: target.email,
        actorRole: opts.ctx.actorRole,
        ttl: this.impersonationTtl,
        reason,
      },
    });

    return {
      access_token: token,
      expiresIn: this.impersonationTtl,
      reason,
      startedAt: new Date(issuedAt * 1000).toISOString(),
      target: {
        id: target.id,
        email: target.email,
        role: target.role,
        firstName: target.firstName,
        lastName: target.lastName,
      },
      actor: {
        id: opts.ctx.actorUserId,
        role: opts.ctx.actorRole,
      },
    };
  }

  /**
   * Records the explicit "stop impersonation" event. The panel just discards
   * the impersonation token and re-uses the actor's original session, so we
   * don't need to mint a new token here — only audit the action.
   */
  async stopImpersonation(opts: {
    actorUserId: string;
    impersonatedUserId: string;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    await this.audit.record({
      action: 'USER_IMPERSONATION_STOPPED',
      userId: opts.impersonatedUserId,
      actorUserId: opts.actorUserId,
      impersonatedBy: opts.actorUserId,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Sprint 6 — Login history + staff audit
  // ---------------------------------------------------------------------------

  /**
   * Łączy `LoginEvent` (sukces) + `LoginAttempt` (sukces/niepowodzenie) w
   * jeden chronologiczny widok. Wyrzuca informację o aktualnym lockout (10/15min).
   */
  async getLoginHistory(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        loginBlocked: true,
        loginBlockedReason: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const lockoutSince = new Date(Date.now() - 15 * 60 * 1000);

    const [events, attempts, recentFailures, suspiciousAlerts] = await Promise.all([
      this.prisma.loginEvent.findMany({
        where: { userId, createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.loginAttempt.findMany({
        where: { email: user.email.toLowerCase(), createdAt: { gte: since } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.loginAttempt.count({
        where: {
          email: user.email.toLowerCase(),
          succeeded: false,
          createdAt: { gte: lockoutSince },
        },
      }),
      this.prisma.auditLog.findMany({
        where: {
          action: { startsWith: 'SUSPICIOUS_LOGIN_' },
          createdAt: { gte: since },
          details: { path: ['email'], equals: user.email.toLowerCase() },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
        },
      }),
    ]);

    const eventRows = events.map((e) => ({
      id: e.id,
      kind: 'success' as const,
      occurredAt: e.createdAt.toISOString(),
      ip: e.ipAddress,
      userAgent: e.userAgent,
      isNewDevice: e.isNewDevice,
      method: e.loginMethod,
      countryCode: e.countryCode,
      reason: null as string | null,
    }));
    const attemptRows = attempts
      .filter((a) => !a.succeeded)
      .map((a) => ({
        id: a.id,
        kind: 'failure' as const,
        occurredAt: a.createdAt.toISOString(),
        ip: a.ip,
        userAgent: a.userAgent,
        isNewDevice: false,
        method: null as string | null,
        countryCode: null as string | null,
        reason: a.reason ?? 'unknown',
      }));

    const merged = [...eventRows, ...attemptRows]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 200);

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        loginBlocked: user.loginBlocked,
        loginBlockedReason: user.loginBlockedReason,
      },
      lockout: {
        windowMinutes: 15,
        threshold: 10,
        recentFailures,
        currentlyLockedOut: recentFailures >= 10,
      },
      suspiciousAlerts: suspiciousAlerts.map((alert) => ({
        id: alert.id,
        action: alert.action,
        details: redactAuditDetails(alert.details),
        createdAt: alert.createdAt.toISOString(),
      })),
      rows: merged,
    };
  }

  /**
   * Sprint 6 — Staff-friendly audit trail dla pojedynczego klienta.
   * STAFF widzi tylko własne akcje (`actorUserId == self`), ADMIN widzi pełny
   * log per użytkownik. Payload `details` jest *minifikowany* (max 200 znaków)
   * żeby nie wyciekały surowe sekrety / tokeny.
   */
  async getCustomerAuditTrail(opts: {
    targetUserId: string;
    actorUserId: string;
    actorRole: Role;
    limit: number;
  }) {
    const limit = Math.min(Math.max(opts.limit, 1), 200);
    const target = await this.prisma.user.findUnique({
      where: { id: opts.targetUserId },
      select: { id: true, email: true, role: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const where: Prisma.AuditLogWhereInput = {
      OR: [{ userId: target.id }, { actorUserId: target.id }],
    };
    if (opts.actorRole === Role.STAFF) {
      where.actorUserId = opts.actorUserId;
      delete where.OR;
    }

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        ipAddress: true,
        userAgent: true,
        actorUserId: true,
        impersonatedBy: true,
        details: true,
        createdAt: true,
      },
    });

    return {
      target: {
        id: target.id,
        email: target.email,
        role: target.role,
      },
      scope: opts.actorRole === Role.STAFF ? 'self' : 'all',
      rows: rows.map((r) => ({
        id: r.id,
        action: r.action,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent
          ? r.userAgent.length > 80
            ? `${r.userAgent.slice(0, 80)}…`
            : r.userAgent
          : null,
        actorUserId: r.actorUserId,
        impersonatedBy: r.impersonatedBy,
        // sanityzacja: nie wystawiamy raw payloadu, tylko widoczne pola.
        details: redactAuditDetails(r.details),
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }
}

/**
 * Sprint 6 — białe listy pól dozwolonych w details. Wszystko inne idzie do
 * `[redacted]`. Implementacja celowo prosta i czytelna — patrzymy na klucze,
 * nie na payload tekstowo.
 */
const SAFE_AUDIT_KEYS = new Set<string>([
  'reason',
  'ttl',
  'targetEmail',
  'subscriptionId',
  'planId',
  'serverId',
  'amount',
  'currency',
  'category',
  'action',
  'invoiceId',
  'jobId',
  'attempt',
  'enabled',
  'changes',
  'remaining',
  'method',
  'newEmail',
  'oldEmail',
  'role',
  'actorRole',
  'failedCount',
  'windowMinutes',
]);

function redactAuditDetails(details: unknown): Record<string, unknown> | null {
  if (!details || typeof details !== 'object') return null;
  const src = details as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (SAFE_AUDIT_KEYS.has(key)) {
      if (typeof value === 'string' && value.length > 200) {
        out[key] = `${value.slice(0, 200)}…`;
      } else {
        out[key] = value;
      }
    } else {
      out[key] = '[redacted]';
    }
  }
  return out;
}

function buildCustomerTimeline(input: {
  tickets: Array<{ id: string; subject: string; status: unknown; createdAt: Date }>;
  invoices: Array<{ id: string; number: string; status: unknown; amount: Prisma.Decimal; currency: string; createdAt: Date }>;
  wallet: Array<{ id: string; type: unknown; amount: Prisma.Decimal; currency: string; createdAt: Date }>;
  audit: Array<{ id: string; action: string; createdAt: Date }>;
}) {
  return [
    ...input.tickets.map((t) => ({
      id: `ticket:${t.id}`,
      kind: 'ticket',
      title: t.subject,
      meta: String(t.status),
      createdAt: t.createdAt.toISOString(),
    })),
    ...input.invoices.map((i) => ({
      id: `invoice:${i.id}`,
      kind: 'invoice',
      title: `Faktura ${i.number}`,
      meta: `${i.status} · ${i.amount.toString()} ${i.currency}`,
      createdAt: i.createdAt.toISOString(),
    })),
    ...input.wallet.map((w) => ({
      id: `wallet:${w.id}`,
      kind: 'wallet',
      title: `Portfel: ${String(w.type)}`,
      meta: `${w.amount.toString()} ${w.currency}`,
      createdAt: w.createdAt.toISOString(),
    })),
    ...input.audit.slice(0, 15).map((a) => ({
      id: `audit:${a.id}`,
      kind: 'audit',
      title: a.action,
      meta: 'audit',
      createdAt: a.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 30);
}

function buildSupportInsights(input: {
  target: { loginBlocked: boolean; deletionRequestedAt: Date | null };
  subscriptions: Array<{ status: unknown; currentPeriodEnd: Date | null }>;
  recentTickets: Array<{ status: unknown; priority: unknown }>;
  openIncidents: Array<unknown>;
}) {
  let riskScore = 0;
  const reasons: string[] = [];
  if (input.target.loginBlocked) {
    riskScore += 25;
    reasons.push('Konto ma blokadę logowania.');
  }
  if (input.target.deletionRequestedAt) {
    riskScore += 40;
    reasons.push('Klient złożył wniosek o usunięcie konta.');
  }
  const openTickets = input.recentTickets.filter((t) => String(t.status) !== 'CLOSED');
  if (openTickets.length >= 3) {
    riskScore += 20;
    reasons.push('Kilka aktywnych zgłoszeń w krótkim oknie.');
  }
  if (input.recentTickets.some((t) => String(t.priority) === 'URGENT')) {
    riskScore += 15;
    reasons.push('W historii znajduje się zgłoszenie URGENT.');
  }
  if (input.subscriptions.some((s) => ['PAST_DUE', 'SUSPENDED'].includes(String(s.status)))) {
    riskScore += 25;
    reasons.push('Subskrypcja ma problem płatniczy lub jest zawieszona.');
  }
  if (input.openIncidents.length > 0) {
    riskScore += 20;
    reasons.push('Na węźle klienta jest otwarty incydent status page.');
  }

  const suggestions = [
    input.openIncidents.length > 0
      ? 'Zacznij od potwierdzenia wpływu incydentu i podaj link do status page.'
      : null,
    openTickets.length > 0
      ? 'Odpowiedz w najstarszym aktywnym tickecie i zamknij duplikaty linkiem do głównego zgłoszenia.'
      : null,
    input.subscriptions.some((s) => String(s.status) === 'PAST_DUE')
      ? 'Sprawdź płatność i zaproponuj bezpieczny retry lub top-up portfela.'
      : null,
    'Jeżeli problem dotyczy domeny, uruchom DNS/TLS diagnostic z profilu klienta przed odpowiedzią.',
  ].filter((v): v is string => Boolean(v));

  return {
    riskScore: Math.min(100, riskScore),
    riskLevel: riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low',
    reasons,
    suggestions,
  };
}
