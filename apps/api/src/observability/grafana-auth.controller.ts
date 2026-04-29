import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@ekohost/database';
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
@Controller('auth/grafana-validate')
export class GrafanaAuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async validate(@Req() req: Request): Promise<{ ok: true; role: string; email: string }> {
    const token = extractToken(req);
    if (!token) throw new UnauthorizedException('No auth token provided');

    let payload: { sub?: string; purpose?: string };
    try {
      payload = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid auth token');
    }
    if (payload.purpose && payload.purpose !== 'access') {
      throw new UnauthorizedException('Token is not an access token');
    }
    if (!payload.sub) throw new UnauthorizedException('Token missing subject');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, canAccessGrafana: true },
    });
    if (!user) throw new UnauthorizedException('User not found');

    const role = mapToGrafanaRole(user.role, user.canAccessGrafana);
    if (!role) {
      throw new ForbiddenException('User has no Grafana access');
    }

    // Caddy reads these via `header_up X-Webauth-User {http.reverse_proxy.header.X-Webauth-User}`
    // (we set them on the response). For Grafana we use the standard
    // X-WEBAUTH-USER + X-WEBAUTH-ROLE headers — Grafana's auth.proxy mode
    // auto-creates the user on first sign-in.
    // Note: NestJS `@Header()` is static; the response.set() approach below
    // would be the alternative. We use a small hack: set them via res
    // through Express adapter.
    (req.res as { setHeader: (n: string, v: string) => void }).setHeader(
      'X-WEBAUTH-USER',
      user.email,
    );
    (req.res as { setHeader: (n: string, v: string) => void }).setHeader(
      'X-WEBAUTH-ROLE',
      role,
    );
    return { ok: true, role, email: user.email };
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice('Bearer '.length).trim();
  }
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === 'auth_token' || k === 'admin_auth_token' || k === 'staff_auth_token') {
        return rest.join('=');
      }
    }
  }
  return null;
}

function mapToGrafanaRole(role: Role, canAccess: boolean): 'Admin' | 'Editor' | null {
  if (role === Role.ADMIN) return 'Admin';
  if (role === Role.STAFF && canAccess) return 'Editor';
  return null;
}
