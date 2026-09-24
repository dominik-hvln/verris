import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokenGuard } from '../api-tokens/api-token.guard';
import { PublicApiWriteController } from './public-api-write.controller';

/** L-08 — zapis przez publiczne API: zakres tokenu pilnuje strażnik, userId tylko z tokenu. */
function kontekst(handler: (...a: never[]) => unknown, scopes: string[]) {
  const req: Record<string, unknown> = { headers: { authorization: 'Bearer vrs_live_x' } };
  const guard = new ApiTokenGuard(
    { verify: jest.fn(async () => ({ userId: 'u1', scopes, tokenId: 't1' })) } as never,
    { user: { findUnique: jest.fn(async () => ({ id: 'u1', role: 'USER', loginBlocked: false, anonymizedAt: null })) } } as never,
    new Reflector(),
  );
  const ctx = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => handler, getClass: () => PublicApiWriteController } as never;
  return { guard, ctx, req };
}

describe('PublicApiWriteController', () => {
  it('wdrożenie wymaga deploy:write; token z samym odczytem → 403', async () => {
    const { guard, ctx } = kontekst(PublicApiWriteController.prototype.wdroz, ['services:read']);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    const ok = kontekst(PublicApiWriteController.prototype.wdroz, ['deploy:write']);
    await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
  });

  it('dns: zapis przez ten sam serwis co panel, z userId z tokenu', async () => {
    const da = { createHostingDnsRecord: jest.fn(async () => ({ ok: true })) };
    const c = new PublicApiWriteController(da as never, {} as never);
    const body = { domain: 'a.pl', name: '_acme-challenge', type: 'TXT', value: 'x' };
    await c.dodajDns({ apiAuth: { userId: 'u1' } } as never, 's1', body as never);
    expect(da.createHostingDnsRecord).toHaveBeenCalledWith('s1', 'u1', body);
    const { guard, ctx } = kontekst(PublicApiWriteController.prototype.dodajDns, ['dns:read']);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
