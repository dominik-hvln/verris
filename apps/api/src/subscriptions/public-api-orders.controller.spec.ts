import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ApiTokenGuard } from '../api-tokens/api-token.guard.js';
import { isValidScope, zakresyDostepne } from '../api-tokens/api-scopes.js';
import { PublicApiOrdersController, ZamowienieApiDto } from './public-api-orders.controller.js';

/** L-08 część 2 (noc 15.10) — zamówienia przez API: domyślnie wyłączone, tylko portfel, wymagana aktualna zgoda. */
const PLAN = '0b6f2c1e-4d5a-4b8e-9c7d-1a2b3c4d5e6f';
const body = { planId: PLAN, interval: 'YEAR', domain: 'firma.pl', immediatePerformanceConsent: true } as unknown as ZamowienieApiDto;
const req = { apiAuth: { userId: 'u1', tokenId: 't1', scopes: ['orders:write'] } } as never;

function kontroler(o: { reconsent?: boolean } = {}) {
  const subs = {
    create: vi.fn(async () => ({
      subscription: { id: 's1', serviceTag: 'abc123', status: 'ACTIVE', interval: 'YEAR', priceAmount: { toString: () => '449.00' }, currency: 'PLN', currentPeriodEnd: new Date('2027-10-15T00:00:00Z') },
    })),
  };
  const consents = { checkReConsent: vi.fn(async () => ({ required: o.reconsent ?? false })) };
  const audit = { record: vi.fn(async () => undefined) };
  return { c: new PublicApiOrdersController(subs as never, consents as never, audit as never), subs, audit };
}

describe('PublicApiOrdersController', () => {
  afterEach(() => delete process.env.API_ZAMOWIENIA);

  it('bez API_ZAMOWIENIA=1 → 404, nic nie zamawia', async () => {
    const { c, subs } = kontroler();
    await expect(c.zamow(req, body)).rejects.toThrow(NotFoundException);
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

  it('niezaakceptowany aktualny regulamin → 409 bez zamówienia', async () => {
    process.env.API_ZAMOWIENIA = '1';
    const { c, subs } = kontroler({ reconsent: true });
    await expect(c.zamow(req, body)).rejects.toThrow(ConflictException);
    expect(subs.create).not.toHaveBeenCalled();
  });

  it('zamówienie: ta sama ścieżka co panel, tylko z portfela; ślad z tokenem; odpowiedź bez danych wewnętrznych', async () => {
    process.env.API_ZAMOWIENIA = '1';
    const { c, subs, audit } = kontroler();
    const w = await c.zamow(req, { ...body, paymentSource: 'STRIPE_CARD', oplata: 'PAYNOW' } as never);
    expect(subs.create).toHaveBeenCalledWith('u1', expect.objectContaining({ planId: PLAN, interval: 'YEAR', domain: 'firma.pl', paymentSource: 'WALLET', oplata: 'PORTFEL', immediatePerformanceConsent: true }));
    expect(audit.record).toHaveBeenCalledWith({ action: 'API_ORDER_CREATED', userId: 'u1', actorUserId: 'u1', details: { subscriptionId: 's1', tokenId: 't1' } });
    expect(w).toEqual({ id: 's1', serviceTag: 'abc123', status: 'ACTIVE', interval: 'YEAR', price: '449.00', currency: 'PLN', currentPeriodEnd: '2027-10-15T00:00:00.000Z' });
  });

  it('walidacja: bez oświadczenia konsumenckiego albo z obcym polem płatności → błąd', async () => {
    expect(await validate(plainToInstance(ZamowienieApiDto, { ...body, immediatePerformanceConsent: false }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(ZamowienieApiDto, { ...body, paymentSource: 'MANUAL' }), { whitelist: true, forbidNonWhitelisted: true })).not.toHaveLength(0);
    expect(await validate(plainToInstance(ZamowienieApiDto, body), { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
  });

  it('zakres orders:write widoczny i do nadania dopiero po włączeniu API_ZAMOWIENIA=1', () => {
    expect(zakresyDostepne()).not.toContain('orders:write');
    expect(isValidScope('orders:write')).toBe(false);
    expect(isValidScope('mail:read')).toBe(true);
    process.env.API_ZAMOWIENIA = '1';
    expect(zakresyDostepne()).toContain('orders:write');
    expect(isValidScope('orders:write')).toBe(true);
  });
});
