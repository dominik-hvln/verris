import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiTokenGuard } from '../api-tokens/api-token.guard.js';
import { PublicApiWriteController } from './public-api-write.controller.js';

/** L-08 — zapis przez publiczne API: zakres tokenu pilnuje strażnik, userId tylko z tokenu. */
function kontekst(handler: (...a: never[]) => unknown, scopes: string[]) {
  const req: Record<string, unknown> = { headers: { authorization: 'Bearer vrs_live_x' } };
  const guard = new ApiTokenGuard(
    { verify: vi.fn(async () => ({ userId: 'u1', scopes, tokenId: 't1' })) } as never,
    { user: { findUnique: vi.fn(async () => ({ id: 'u1', role: 'USER', loginBlocked: false, anonymizedAt: null })) } } as never,
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
    const da = { createHostingDnsRecord: vi.fn(async () => ({ ok: true })) };
    const c = new PublicApiWriteController(da as never, {} as never);
    const body = { domain: 'a.pl', name: '_acme-challenge', type: 'TXT', value: 'x' };
    await c.dodajDns({ apiAuth: { userId: 'u1' } } as never, 's1', body as never);
    expect(da.createHostingDnsRecord).toHaveBeenCalledWith('s1', 'u1', body);
    const { guard, ctx } = kontekst(PublicApiWriteController.prototype.dodajDns, ['dns:read']);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  // Noc 15.10 — skrzynki przez API (decyzja 02.10: zamówienia i skrzynki przez API po starcie).
  it('skrzynki: odczyt wymaga mail:read, zapis mail:write; token DNS-owy nic nie zmieni w poczcie', async () => {
    for (const [h, zakres] of [
      [PublicApiWriteController.prototype.skrzynki, 'mail:read'],
      [PublicApiWriteController.prototype.zalozSkrzynke, 'mail:write'],
      [PublicApiWriteController.prototype.hasloSkrzynki, 'mail:write'],
      [PublicApiWriteController.prototype.rozmiarSkrzynki, 'mail:write'],
      [PublicApiWriteController.prototype.usunSkrzynke, 'mail:write'],
    ] as const) {
      const zly = kontekst(h, ['dns:read', 'dns:write', 'services:read']);
      await expect(zly.guard.canActivate(zly.ctx)).rejects.toThrow(ForbiddenException);
      const ok = kontekst(h, [zakres]);
      await expect(ok.guard.canActivate(ok.ctx)).resolves.toBe(true);
    }
    // Odczyt nie otwiera zapisu.
    const tylkoOdczyt = kontekst(PublicApiWriteController.prototype.usunSkrzynke, ['mail:read']);
    await expect(tylkoOdczyt.guard.canActivate(tylkoOdczyt.ctx)).rejects.toThrow(ForbiddenException);
  });

  it('skrzynki: te same metody serwisu co panel, z userId z tokenu', async () => {
    const da = {
      listHostingEmailAccounts: vi.fn(async () => ({ rows: [] })),
      createHostingEmailAccount: vi.fn(async () => ({ ok: true })),
      changeHostingEmailPassword: vi.fn(async () => ({ ok: true })),
      changeHostingEmailQuota: vi.fn(async () => ({ ok: true })),
      deleteHostingEmailAccount: vi.fn(async () => ({ ok: true })),
    };
    const c = new PublicApiWriteController(da as never, {} as never);
    const req = { apiAuth: { userId: 'u1' } } as never;
    await c.skrzynki(req, 's1');
    expect(da.listHostingEmailAccounts).toHaveBeenCalledWith('s1', 'u1');
    const nowa = { email: 'biuro@a.pl', password: 'Dlugie-haslo-1', quotaMb: 2048 };
    await c.zalozSkrzynke(req, 's1', nowa as never);
    expect(da.createHostingEmailAccount).toHaveBeenCalledWith('s1', 'u1', nowa);
    await c.hasloSkrzynki(req, 's1', { email: 'biuro@a.pl', password: 'Inne-haslo-22' } as never);
    expect(da.changeHostingEmailPassword).toHaveBeenCalledWith('s1', 'u1', { email: 'biuro@a.pl', password: 'Inne-haslo-22' });
    await c.rozmiarSkrzynki(req, 's1', { email: 'biuro@a.pl', quotaMb: 4096 } as never);
    expect(da.changeHostingEmailQuota).toHaveBeenCalledWith('s1', 'u1', { email: 'biuro@a.pl', quotaMb: 4096 });
    await c.usunSkrzynke(req, 's1', { email: 'biuro@a.pl' } as never);
    expect(da.deleteHostingEmailAccount).toHaveBeenCalledWith('s1', 'u1', 'biuro@a.pl');
  });

  it('skrzynki: walidacja body jak w panelu (krótkie hasło, zły adres, rozmiar poza zakresem)', async () => {
    const { plainToInstance } = await import('class-transformer');
    const { validate } = await import('class-validator');
    const { UtworzSkrzynkeDto, UsunSkrzynkeApiDto, ZmienRozmiarSkrzynkiDto } = await import('./dto/hosting-email.dto.js');
    expect(await validate(plainToInstance(UtworzSkrzynkeDto, { email: 'biuro@a.pl', password: 'krotkie' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UtworzSkrzynkeDto, { email: 'biuro@a.pl', password: 'Dlugie-haslo-1' }))).toHaveLength(0);
    expect(await validate(plainToInstance(UsunSkrzynkeApiDto, { email: 'to-nie-adres' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ZmienRozmiarSkrzynkiDto, { email: 'biuro@a.pl', quotaMb: 5 }))).not.toHaveLength(0);
  });
});
