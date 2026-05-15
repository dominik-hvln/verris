import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';

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
        lastLoginAt: null, // Reserved for future telemetry
      })),
    };
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

    const token = this.jwt.sign(
      {
        sub: target.id,
        email: target.email,
        role: target.role,
        purpose: 'access',
        actorUserId: opts.ctx.actorUserId,
        impersonatedBy: opts.ctx.actorUserId,
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
        reason: opts.reason ?? null,
      },
    });

    return {
      access_token: token,
      expiresIn: this.impersonationTtl,
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
}
