import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { odbierzKodPrzekazania, wydajKodPrzekazania } from '../common/auth/przekazanie-sesji';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

/**
 * F-15: Caddy `forward_auth` integration for Grafana SSO. Caddy forwards the
 * incoming request to this endpoint with cookies/headers attached; if we
 * answer 200 it lets the request continue to Grafana, otherwise it 401/403.
 *
 * Headers we set on a successful response are picked up by Caddy via the
 * `header_up` directive and sent to Grafana as
 * `auth.proxy.header_name = X-WEBAUTH-USER`. Grafana then auto-creates / logs
 * in that user with the role we declare in `X-WEBAUTH-ROLE`.
 *
 * Authorisation:
 *   - ADMIN          → Grafana role "Admin"
 *   - STAFF + flag   → Grafana role "Editor"
 *   - everybody else → 403, Caddy rejects
 *
 * The endpoint accepts the JWT in either:
 *   1. `Authorization: Bearer <jwt>` (when a panel attaches it) — preferred
 *      when Grafana is a sub-domain of an authenticated panel.
 *   2. `Cookie: auth_token=<jwt>` — same cookie used by client/staff/admin
 *      panels.
 */
type WynikDostepu = { email: string; role: 'Admin' | 'Editor'; payload: { sub: string; tv?: number; sid?: string } };

const CIASTECZKO = 'grafana_session';
const SESJA_S = 8 * 60 * 60;

@Controller('auth')
export class GrafanaAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  /** Te same bramki co JwtStrategy + rola w Grafanie. `cele` = dopuszczalne `purpose` tokenu. */
  private async sprawdz(token: string | null, cele: string[]): Promise<WynikDostepu> {
    if (!token) throw new UnauthorizedException('No auth token provided');
    let payload: { sub?: string; purpose?: string; tv?: number; sid?: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid auth token');
    }
    if (!cele.includes(payload.purpose ?? 'access')) throw new UnauthorizedException('Wrong token purpose');
    if (!payload.sub) throw new UnauthorizedException('Token missing subject');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, canAccessGrafana: true, loginBlocked: true, anonymizedAt: true, tokenVersion: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    // Te same bramki co JwtStrategy: wylogowanie wszędzie (tokenVersion), zablokowanie konta,
    // anonimizacja i unieważniona sesja urządzenia odcinają też Grafanę — nie tylko panel.
    if ((payload.tv ?? 0) !== user.tokenVersion) throw new UnauthorizedException('Session has been invalidated');
    if (user.anonymizedAt) throw new UnauthorizedException('Account no longer exists');
    if (user.loginBlocked && user.role !== Role.ADMIN) throw new UnauthorizedException('Account is blocked');
    if (payload.sid) {
      const sesja = await this.prisma.userSession.findUnique({ where: { id: payload.sid }, select: { userId: true, revokedAt: true } });
      if (!sesja || sesja.userId !== user.id || sesja.revokedAt) throw new UnauthorizedException('Session has been revoked');
    }
    const role = mapToGrafanaRole(user.role, user.canAccessGrafana);
    if (!role) throw new ForbiddenException('User has no Grafana access');
    return { email: user.email, role, payload: { sub: payload.sub, tv: payload.tv, sid: payload.sid } };
  }

  /** Caddy forward_auth przed każdym żądaniem do Grafany. */
  @Get('grafana-validate')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async validate(@Req() req: Request): Promise<{ ok: true; role: string; email: string }> {
    const { email, role } = await this.sprawdz(extractToken(req), ['access', 'grafana']);
    // Caddy kopiuje te nagłówki do Grafany (auth.proxy: X-WEBAUTH-USER / X-WEBAUTH-ROLE).
    (req.res as { setHeader: (n: string, v: string) => void }).setHeader('X-WEBAUTH-USER', email);
    (req.res as { setHeader: (n: string, v: string) => void }).setHeader('X-WEBAUTH-ROLE', role);
    return { ok: true, role, email };
  }

  /**
   * Panel admina/obsługi (serwer, z tokenem operatora) prosi o bilet do Grafany: jednorazowy kod
   * na 60 s, za którym stoi osobny token sesji Grafany (purpose=grafana, 8 h). Dzięki temu
   * ciasteczka paneli nie muszą już być na całej domenie .verris.pl.
   */
  @Post('grafana-ticket')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async ticket(@Req() req: Request): Promise<{ code: string }> {
    const header = req.headers.authorization;
    const { payload } = await this.sprawdz(header?.startsWith('Bearer ') ? header.slice(7).trim() : null, ['access']);
    const token = this.jwt.sign({ sub: payload.sub, purpose: 'grafana', tv: payload.tv, sid: payload.sid }, { expiresIn: SESJA_S });
    return { code: wydajKodPrzekazania(token) };
  }

  /**
   * Na hoście Grafany (Caddy: /verris-sso → tutaj): kod → ciasteczko sesji Grafany tylko dla tego
   * hosta (bez Domain) → przekierowanie na ścieżkę w Grafanie.
   */
  @Get('grafana-sso')
  async sso(@Req() req: Request, @Query('code') code: string, @Query('to') to?: string) {
    const token = odbierzKodPrzekazania(code);
    if (!token) throw new UnauthorizedException('Kod wygasł albo został już użyty — otwórz Grafanę ponownie z panelu.');
    await this.sprawdz(token, ['grafana']);
    const res = req.res as unknown as { cookie: (n: string, v: string, o: Record<string, unknown>) => void; redirect: (s: number, u: string) => void };
    res.cookie(CIASTECZKO, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESJA_S * 1000 });
    res.redirect(302, bezpiecznaSciezka(to));
  }
}

/** Tylko ścieżka na tym samym hoście — „//host”, „/\\host”, znaki sterujące i pełne adresy odpadają. */
export function bezpiecznaSciezka(to: string | undefined): string {
  const t = (to ?? '').trim();
  return /^\/(?![/\\])[^\x00-\x1f\x7f]*$/.test(t) ? t : '/';
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  // Tylko własne ciasteczko hosta Grafany. Ciasteczek sesji paneli (auth_token, admin/staff_auth_token)
  // Grafana już nie czyta — nie są ustawiane na całą domenę .verris.pl.
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === CIASTECZKO) return rest.join('=');
    }
  }
  return null;
}

function mapToGrafanaRole(role: Role, canAccess: boolean): 'Admin' | 'Editor' | null {
  if (role === Role.ADMIN) return 'Admin';
  if (role === Role.STAFF && canAccess) return 'Editor';
  return null;
}
