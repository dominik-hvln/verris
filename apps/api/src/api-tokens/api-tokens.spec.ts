import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { ApiTokenGuard } from './api-token.guard.js';
import { ApiTokensService } from './api-tokens.service.js';
import { API_SCOPE_KEY } from './api-scope.decorator.js';
import { PublicApiController } from './public-api.controller.js';
import { PublicApiWriteController } from '../subscriptions/public-api-write.controller.js';
import { ApiTokensController } from './api-tokens.controller.js';
import { ClientWebhooksController } from '../client-webhooks/client-webhooks.controller.js';

/**
 * L-09 — tokeny API z zakresami: weryfikacja sekretu, wygaśnięcie, unieważnienie, strażnik
 * (rola, blokada, zakres) i to, że żadna trasa publicznego API nie jest bez zakresu.
 */
function serwis(row: Record<string, unknown> | null) {
  const repo = {
    findUnique: vi.fn(async () => row),
    update: vi.fn(async () => row),
    count: vi.fn(async () => 0),
    create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', createdAt: new Date(), lastUsedAt: null, lastUsedIp: null, revokedAt: null, ...a.data })),
    findFirst: vi.fn(async () => row),
    findMany: vi.fn(async () => []),
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { s: new ApiTokensService({ apiToken: repo } as never, audit as never), repo, audit };
}

describe('ApiTokensService.verify (L-09)', () => {
  const secret = 'a'.repeat(48);
  let hash: string;
  beforeAll(async () => {
    hash = await bcrypt.hash(secret, 4);
  });
  const row = (over: Record<string, unknown> = {}) => ({
    id: 't1', userId: 'u1', prefix: 'vrs_live_abc', hash, scopes: ['dns:read'],
    expiresAt: null, revokedAt: null, lastUsedAt: null, lastUsedIp: null, ...over,
  });

  it('poprawny token → userId i zakresy z bazy', async () => {
    const { s } = serwis(row());
    await expect(s.verify(`vrs_live_abc.${secret}`)).resolves.toEqual({ userId: 'u1', scopes: ['dns:read'], tokenId: 't1' });
  });

  it.each([
    ['zły sekret', {}, `vrs_live_abc.${'b'.repeat(48)}`],
    ['unieważniony', { revokedAt: new Date() }, `vrs_live_abc.${secret}`],
    ['wygasły', { expiresAt: new Date(Date.now() - 1000) }, `vrs_live_abc.${secret}`],
    ['obcy prefiks', {}, `ghp_abc.${secret}`],
    ['bez kropki', {}, `vrs_live_abc${secret}`],
    ['krótki sekret', {}, 'vrs_live_abc.krotki'],
  ])('odmowa: %s', async (_n, over, raw) => {
    const { s } = serwis(row(over));
    await expect(s.verify(raw)).resolves.toBeNull();
  });

  it('tworzenie: sekret pokazany raz, w bazie tylko hash; nieznane zakresy odrzucone', async () => {
    const { s, repo } = serwis(null);
    const { token, view } = await s.create('u1', { name: 'CI', scopes: ['dns:write', 'admin:all'] });
    const data = (repo.create.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data.scopes).toEqual(['dns:write']);
    const [prefix, sec] = token.split('.');
    expect(data.prefix).toBe(prefix);
    expect(JSON.stringify(data)).not.toContain(sec);
    expect(await bcrypt.compare(sec, String(data.hash))).toBe(true);
    expect(JSON.stringify(view)).not.toContain(sec);
  });
});

describe('ApiTokenGuard (L-09)', () => {
  const handler = PublicApiController.prototype.services;
  function straz(opts: { header?: string; verified?: unknown; user?: unknown; h?: unknown } = {}) {
    const req: Record<string, unknown> = { headers: { authorization: opts.header ?? 'Bearer vrs_live_x.y' } };
    const guard = new ApiTokenGuard(
      { verify: vi.fn(async () => (opts.verified === undefined ? { userId: 'u1', scopes: ['services:read'], tokenId: 't1' } : opts.verified)) } as never,
      { user: { findUnique: vi.fn(async () => (opts.user === undefined ? { id: 'u1', role: 'USER', loginBlocked: false, anonymizedAt: null } : opts.user)) } } as never,
      new Reflector(),
    );
    const ctx = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => opts.h ?? handler, getClass: () => PublicApiController } as never;
    return { run: () => guard.canActivate(ctx), req };
  }

  it('wpuszcza z właściwym zakresem i przypina userId z tokenu', async () => {
    const t = straz();
    await expect(t.run()).resolves.toBe(true);
    expect(t.req.apiAuth).toEqual({ userId: 'u1', scopes: ['services:read'], tokenId: 't1' });
  });

  it.each([
    ['brak nagłówka', { header: '' }, UnauthorizedException],
    ['zły token', { verified: null }, UnauthorizedException],
    ['konto usunięte', { user: null }, UnauthorizedException],
    ['konto zanonimizowane', { user: { role: 'USER', loginBlocked: false, anonymizedAt: new Date() } }, UnauthorizedException],
    ['konto zablokowane', { user: { role: 'USER', loginBlocked: true, anonymizedAt: null } }, UnauthorizedException],
    ['token operatora', { user: { role: 'ADMIN', loginBlocked: false, anonymizedAt: null } }, ForbiddenException],
    ['brak zakresu', { verified: { userId: 'u1', scopes: ['billing:read'], tokenId: 't1' } }, ForbiddenException],
    ['trasa bez @ApiScope (fail-closed)', { h: function bezZakresu() {} }, ForbiddenException],
  ])('odmowa: %s', async (_n, opts, typ) => {
    await expect(straz(opts as never).run()).rejects.toBeInstanceOf(typ);
  });

  it('każda trasa publicznego API ma zadeklarowany zakres', () => {
    for (const C of [PublicApiController, PublicApiWriteController]) {
      const proto = C.prototype as unknown as Record<string, unknown>;
      const trasy = Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor' && typeof proto[k] === 'function');
      expect(trasy.length).toBeGreaterThan(0);
      for (const k of trasy) {
        expect([C.name, k, Reflect.getMetadata(API_SCOPE_KEY, proto[k] as object)]).toEqual([C.name, k, expect.any(String)]);
      }
    }
  });
});

describe('subkonto — zakresy tokenu i zdarzenia webhooków (L-09/L-10)', () => {
  const sk = (...p: string[]) => ({ userId: 'owner', customerOwnerId: 'owner', customerPermissions: p });

  it('token: subkonto bez DNS_MANAGE nie nada dns:write; z uprawnieniem — tak; właściciel bez ograniczeń', async () => {
    const create = vi.fn(async () => ({ token: 't', view: {} }));
    const c = new ApiTokensController({ create } as never);
    expect(() => c.create(sk('SETTINGS_MANAGE', 'SERVICES_READ'), { name: 'CI', scopes: ['services:read', 'dns:write'] })).toThrow('dns:write');
    expect(create).not.toHaveBeenCalled();
    await c.create(sk('SETTINGS_MANAGE', 'DNS_MANAGE'), { name: 'CI', scopes: ['dns:write'] });
    await c.create({ userId: 'owner' }, { name: 'CI', scopes: ['deploy:write', 'billing:read'] });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('webhook: zdarzenia rozliczeń wymagają BILLING_READ u subkonta', () => {
    const dodaj = vi.fn(async () => ({}));
    const c = new ClientWebhooksController({ dodaj } as never);
    expect(() => c.dodaj(sk('SETTINGS_MANAGE'), { url: 'https://x.pl/h', events: ['task.completed', 'invoice.issued'] })).toThrow('invoice.issued');
    void c.dodaj(sk('SETTINGS_MANAGE'), { url: 'https://x.pl/h', events: ['task.completed'] });
    void c.dodaj(sk('SETTINGS_MANAGE', 'BILLING_READ'), { url: 'https://x.pl/h', events: ['invoice.issued'] });
    expect(dodaj).toHaveBeenCalledTimes(2);
  });
});
