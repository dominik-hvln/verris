import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ApiTokensService } from './api-tokens.service';
import { API_SCOPE_KEY } from './api-scope.decorator';
import type { ApiScopeValue } from './api-scopes';

/**
 * Guard publicznego API klienta. Czyta Authorization: Bearer vrs_live_…,
 * weryfikuje token, sprawdza wymagany scope i status konta. Nigdy nie wpuszcza
 * tokenów ADMIN/STAFF — token działa wyłącznie w obrębie konta właściciela.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: ApiTokensService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header = String(req.headers['authorization'] ?? '');
    const m = header.match(/^Bearer\s+(.+)$/i);
    if (!m) throw new UnauthorizedException('Brak tokenu API (Authorization: Bearer …).');

    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip;
    const verified = await this.tokens.verify(m[1].trim(), ip);
    if (!verified) throw new UnauthorizedException('Nieprawidłowy lub wygasły token API.');

    const user = await this.prisma.user.findUnique({
      where: { id: verified.userId },
      select: { id: true, role: true, loginBlocked: true, anonymizedAt: true },
    });
    if (!user || user.anonymizedAt) throw new UnauthorizedException('Konto nie istnieje.');
    if (user.loginBlocked) throw new UnauthorizedException('Konto jest zablokowane.');
    if (user.role !== 'USER') throw new ForbiddenException('Tokeny API są dostępne tylko dla kont klienckich.');

    const required = this.reflector.getAllAndOverride<ApiScopeValue | undefined>(API_SCOPE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (required && !verified.scopes.includes(required)) {
      throw new ForbiddenException(`Token nie ma uprawnienia „${required}".`);
    }

    req.apiAuth = { userId: verified.userId, scopes: verified.scopes, tokenId: verified.tokenId };
    return true;
  }
}
