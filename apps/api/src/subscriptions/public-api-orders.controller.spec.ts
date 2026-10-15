import { BadRequestException, ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiTokenGuard } from '../api-tokens/api-token.guard.js';
import { isValidScope, zakresyDostepne } from '../api-tokens/api-scopes.js';
import { FlagaZamowienApiGuard, PublicApiOrdersController, ZamowienieApiDto } from './public-api-orders.controller.js';

/** L-08 część 2 (noc 15.10) — zamówienia przez API: domyślnie wyłączone, tylko portfel, idempotentne, aktualna zgoda. */
const PLAN = '0b6f2c1e-4d5a-4b8e-9c7d-1a2b3c4d5e6f';
const body = { planId: PLAN, interval: 'YEAR', domain: 'WWW.Firma.pl', immediatePerformanceConsent: true } as unknown as ZamowienieApiDto;
const req = { apiAuth: { userId: 'u1', tokenId: 't1', scopes: ['orders:write'] } } as never;

function kontroler(o: { reconsent?: boolean; wpisy?: { action: string; details: unknown }[]; ileWGodzine?: number; createPada?: boolean } = {}) {
  const subs = {
    create: vi.fn(async () => {
      if (o.createPada) throw new Error('Brak środków w portfelu.');
      return { subscription: { id: 's1', serviceTag: 'abc123', status: 'PROVISIONING', interval: 'YEAR', priceAmount: { toString: () => '449.00' }, currency: 'PLN', currentPeriodEnd: new Date('2027-10-15T00:00:00Z') } };
    }),
  };
  const consents = { checkReConsent: vi.fn(async () => ({ required: o.reconsent ?? false })) };
  const zapisane: { action: string; details: Record<string, unknown> }[] = [];
  const tx = { $executeRaw: vi.fn(async () => 0) };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    auditLog: {
      findMany: vi.fn(async (q: { where: { action: unknown } }) => (typeof q.where.action === 'object' ? (o.wpisy ?? []) : [])),
      count: vi.fn(async () => o.ileWGodzine ?? 0),
      create: vi.fn(async (q: { data: { action: string; details: Record<string, unknown> } }) => void zapisane.push(q.data)),
    },
    subscription: { findUnique: vi.fn(async () => null) },
  };
  return { c: new PublicApiOrdersController(subs as never, consents as never, prisma as never), subs, prisma, tx, zapisane };
}

describe('PublicApiOrdersController', () => {
  beforeEach(() => {
    process.env.API_ZAMOWIENIA = '1';
  });
  afterEach(() => delete process.env.API_ZAMOWIENIA);

  it('bez API_ZAMOWIENIA=1 → 404 z pierwszego strażnika (przed tokenem) i z metody', async () => {
    delete process.env.API_ZAMOWIENIA;
    expect(() => new FlagaZamowienApiGuard().canActivate()).toThrow(NotFoundException);
    const { c, subs } = kontroler();
    await expect(c.zamow(req, body, 'klucz-12345')).rejects.toThrow(NotFoundException);
    expect(subs.create).not.toHaveBeenCalled();
  });

  it('wymaga zakresu orders:write (token z odczytem i DNS → 403)', async () => {
    const kontekst = (scopes: string[]) => {
      const r: Record<string, unknown> = { headers: { authorization: 'Bearer vrs_live_x' } };
      const g = new ApiTokenGuard(
        { verify: vi.fn(async () => ({ userId: 'u1', scopes, tokenId: 't1' })) } as never,
        { user: { findUnique: vi.fn(async () => ({ id: 'u1', role: 'USER', loginBlocked: false, anonymizedAt: null })) } } as never,
        new Reflector(),
      );
      const ctx = { switchToHttp: () => ({ getRequest: () => r }), getHandler: () => PublicApiOrdersController.prototype.zamow, getClass: () => PublicApiOrdersController } as never;
      return g.canActivate(ctx);
    };
    await expect(kontekst(['services:read', 'billing:read', 'dns:write'])).rejects.toThrow(ForbiddenException);
    await expect(kontekst(['orders:write'])).resolves.toBe(true);
  });

  it('bez Idempotency-Key albo z niepoprawnym → 400', async () => {
    const { c, subs } = kontroler();
    await expect(c.zamow(req, body, undefined)).rejects.toThrow(BadRequestException);
    await expect(c.zamow(req, body, 'krótki')).rejects.toThrow(BadRequestException);
    expect(subs.create).not.toHaveBeenCalled();
  });

  it('zamówienie: pod blokadą klienta, znacznik PRZED obciążeniem, tylko z portfela, domena bez www.', async () => {
    const { c, subs, tx, zapisane } = kontroler();
    const w = await c.zamow(req, { ...body, paymentSource: 'STRIPE_CARD', oplata: 'PAYNOW' } as never, 'klucz-12345');
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(zapisane.map((z) => z.action)).toEqual(['API_ORDER_STARTED', 'API_ORDER_CREATED']);
    expect(subs.create).toHaveBeenCalledWith('u1', expect.objectContaining({ domain: 'firma.pl', paymentSource: 'WALLET', oplata: 'PORTFEL', immediatePerformanceConsent: true }));
    expect(zapisane[1].details).toMatchObject({ idempotencyKey: 'klucz-12345', tokenId: 't1', domain: 'firma.pl', subscriptionId: 's1' });
    expect(w).toEqual({ id: 's1', serviceTag: 'abc123', status: 'PROVISIONING', interval: 'YEAR', price: '449.00', currency: 'PLN', currentPeriodEnd: '2027-10-15T00:00:00.000Z' });
  });

  it('ponowienie z tym samym kluczem: wynik pierwszego, bez drugiego zamówienia; przerwane → 409', async () => {
    const pierwsza = { id: 's1', status: 'PROVISIONING' };
    const a = kontroler({ wpisy: [{ action: 'API_ORDER_CREATED', details: { odpowiedz: pierwsza } }, { action: 'API_ORDER_STARTED', details: {} }] });
    expect(await a.c.zamow(req, body, 'klucz-12345')).toEqual(pierwsza);
    expect(a.subs.create).not.toHaveBeenCalled();
    const b = kontroler({ wpisy: [{ action: 'API_ORDER_STARTED', details: {} }] });
    await expect(b.c.zamow(req, body, 'klucz-12345')).rejects.toThrow(ConflictException);
    expect(b.subs.create).not.toHaveBeenCalled();
  });

  it('nieudane zamówienie (np. brak środków): znacznik FAILED, ten sam klucz wolno ponowić', async () => {
    const { c, zapisane } = kontroler({ createPada: true });
    await expect(c.zamow(req, body, 'klucz-12345')).rejects.toThrow('Brak środków');
    expect(zapisane.map((z) => z.action)).toEqual(['API_ORDER_STARTED', 'API_ORDER_FAILED']);
    const ponowienie = kontroler({ wpisy: [{ action: 'API_ORDER_FAILED', details: {} }, { action: 'API_ORDER_STARTED', details: {} }] });
    await ponowienie.c.zamow(req, body, 'klucz-12345');
    expect(ponowienie.subs.create).toHaveBeenCalled();
  });

  it('limit na konto (10/h) i niezaakceptowany regulamin → odmowa bez zamówienia', async () => {
    const a = kontroler({ ileWGodzine: 10 });
    await expect(a.c.zamow(req, body, 'klucz-12345')).rejects.toThrow(HttpException);
    expect(a.subs.create).not.toHaveBeenCalled();
    const b = kontroler({ reconsent: true });
    await expect(b.c.zamow(req, body, 'klucz-12345')).rejects.toThrow(ConflictException);
    expect(b.subs.create).not.toHaveBeenCalled();
  });

  it('walidacja: bez oświadczenia konsumenckiego albo z obcym polem płatności → błąd', async () => {
    expect(await validate(plainToInstance(ZamowienieApiDto, { ...body, immediatePerformanceConsent: false }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ZamowienieApiDto, { ...body, paymentSource: 'MANUAL' }), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
    expect(await validate(plainToInstance(ZamowienieApiDto, body), { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('zakres orders:write widoczny i do nadania dopiero po włączeniu API_ZAMOWIENIA=1', () => {
    delete process.env.API_ZAMOWIENIA;
    expect(zakresyDostepne()).not.toContain('orders:write');
    expect(isValidScope('orders:write')).toBe(false);
    expect(isValidScope('mail:read')).toBe(true);
    process.env.API_ZAMOWIENIA = '1';
    expect(zakresyDostepne()).toContain('orders:write');
    expect(isValidScope('orders:write')).toBe(true);
  });
});
