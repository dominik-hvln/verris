import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwtSecret')!,
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    role: string;
    purpose?: string;
    tv?: number;
    sid?: string;
    actorUserId?: string;
    impersonatedBy?: string;
    /** PB-20 — konto, na którym działa deweloper z własnym loginem (przełącznik kont). */
    actingFor?: string;
  }) {
    // Reject "2fa-challenge" tokens — those are issued mid-login and must NEVER
    // grant access to protected endpoints. They can only be redeemed via
    // POST /auth/login/2fa.
    if (payload.purpose && payload.purpose !== 'access') {
      throw new UnauthorizedException('Token cannot be used for this request');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        loginBlocked: true,
        anonymizedAt: true,
        tokenVersion: true,
        customerOwnerId: true,
        customerPermissions: true,
        subaccountDisabledAt: true,
        subaccountServiceIds: true,
        customerOwner: { select: { anonymizedAt: true, loginBlocked: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Token refers to a non-existent user');
    }
    // C3: a bumped tokenVersion invalidates every token minted before it
    // ("wyloguj wszystkie urządzenia", forced logout after password reset).
    // Tokens issued before this field existed carry no `tv` → treat as 0.
    if ((payload.tv ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException('Session has been invalidated');
    }
    // Audit F-08: a block must take effect immediately, not when the JWT
    // expires — the strategy already hits the DB per request, so this check
    // is free. Same for RODO-anonymised accounts.
    // Blokada dotyczy klientów (USER) i operatorów (STAFF — dezaktywacja w „Mój zespół").
    // ADMIN nigdy nie jest blokowany, by nie odciąć całego dostępu administracyjnego.
    if (user.loginBlocked && user.role !== 'ADMIN') {
      throw new UnauthorizedException('Account is blocked');
    }
    if (user.anonymizedAt) {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (user.customerOwnerId && user.subaccountDisabledAt) {
      throw new UnauthorizedException('Subaccount is disabled');
    }
    // Subkonto działa jako właściciel — gdy właściciela zanonimizowano albo zablokowano, subkonto też traci dostęp.
    if (user.customerOwnerId && (user.customerOwner?.anonymizedAt || user.customerOwner?.loginBlocked)) {
      throw new UnauthorizedException('Owner account is not available');
    }

    // SEC-10 — sesyjna rewokacja pojedynczego urządzenia. Backward-compatible:
    // tokeny BEZ `sid` (sprzed wdrożenia) pomijają tę kontrolę i działają dalej.
    if (payload.sid) {
      const session = await this.prisma.userSession.findUnique({
        where: { id: payload.sid },
        select: { id: true, userId: true, revokedAt: true, lastSeenAt: true },
      });
      if (!session || session.userId !== user.id || session.revokedAt) {
        throw new UnauthorizedException('Session has been revoked');
      }
      // Throttlowany zapis „ostatnio widziano" (maks. raz na 5 min — bez write/req).
      if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
        void this.prisma.userSession
          .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
          .catch(() => undefined);
      }
    }

    // PB-20 — praca na cudzym koncie z własnego loginu. Członkostwo sprawdzane przy KAŻDYM żądaniu:
    // odebrany dostęp działa od razu. Nieaktualne członkostwo = token wraca do własnego konta
    // (mniej uprawnień, nigdy więcej) — panel pokaże wtedy konto dewelopera.
    if (payload.actingFor && !user.customerOwnerId && user.role === 'USER' && !payload.impersonatedBy) {
      const m = await this.prisma.customerMembership.findUnique({
        where: { ownerUserId_memberUserId: { ownerUserId: payload.actingFor, memberUserId: user.id } },
        select: { permissions: true, serviceIds: true, disabledAt: true, owner: { select: { anonymizedAt: true, loginBlocked: true } } },
      });
      if (m && !m.disabledAt && !m.owner.anonymizedAt && !m.owner.loginBlocked) {
        return {
          userId: payload.actingFor,
          principalUserId: user.id,
          email: user.email,
          role: user.role,
          customerOwnerId: payload.actingFor,
          customerPermissions: m.permissions,
          serviceScope: m.serviceIds,
          actingFor: payload.actingFor,
          sid: payload.sid,
        };
      }
    }

    return {
      userId: user.customerOwnerId ?? user.id,
      principalUserId: user.id,
      email: user.email,
      role: user.role,
      customerOwnerId: user.customerOwnerId,
      customerPermissions: user.customerPermissions,
      serviceScope: user.customerOwnerId ? user.subaccountServiceIds : [],
      sid: payload.sid,
      // E-5 impersonation hooks (will be set by /admin/users/:id/impersonate).
      actorUserId: payload.actorUserId,
      impersonatedBy: payload.impersonatedBy,
    };
  }
}
