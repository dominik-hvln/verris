import { EventEmitter } from 'node:events';
import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RATE_LIMIT_KEY, RateLimitGuard, komunikatLimitu, type RateLimitOptions } from './rate-limit.guard.js';

/**
 * Paczka 109 — P5-03 / P3-12 / A1-02. Na starym kodzie: każda odrzucona próba (400) zjadała limit rejestracji
 * i zamówień, limit zamówień był per IP (biuro za NAT-em), a komunikat mówił „za chwilę” przy blokadzie na godzinę.
 */
function guard(options: RateLimitOptions) {
  delete process.env.REDIS_URL;
  const reflector = { getAllAndOverride: (k: string) => (k === RATE_LIMIT_KEY ? options : undefined) } as unknown as Reflector;
  return new RateLimitGuard(reflector);
}

function zadanie(ip: string, token?: string) {
  const res = Object.assign(new EventEmitter(), { statusCode: 200 });
  const ctx = {
    getType: () => 'http',
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({
      getRequest: () => ({ ip, body: {}, method: 'POST', path: '/x', route: { path: '/x' }, headers: token ? { authorization: `Bearer ${token}` } : {} }),
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, res };
}

async function proba(g: RateLimitGuard, ip: string, status: number, token?: string): Promise<number> {
  const { ctx, res } = zadanie(ip, token);
  try {
    await g.canActivate(ctx);
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : 500;
  }
  res.statusCode = status;
  res.emit('finish');
  await new Promise((r) => setImmediate(r));
  return status;
}

describe('RateLimitGuard — tylko udane próby (P5-03)', () => {
  const REJ: RateLimitOptions = { limit: 3, windowMs: 3_600_000, scope: 'auth:register', tylkoUdane: true, limitProb: 10 };

  it('odrzucenia z walidacji nie zjadają limitu; udane tak', async () => {
    const g = guard(REJ);
    for (let i = 0; i < 6; i++) expect(await proba(g, '1.1.1.1', 400)).toBe(400);
    expect(await proba(g, '1.1.1.1', 201)).toBe(201);
    expect(await proba(g, '1.1.1.1', 201)).toBe(201);
    expect(await proba(g, '1.1.1.1', 201)).toBe(201);
    expect(await proba(g, '1.1.1.1', 201)).toBe(429);
  });

  it('bezpiecznik wszystkich prób: po limitProb także nieudane dostają 429', async () => {
    const g = guard(REJ);
    const kody: number[] = [];
    for (let i = 0; i < 11; i++) kody.push(await proba(g, '2.2.2.2', 400));
    expect(kody.slice(0, 10).every((k) => k === 400)).toBe(true);
    expect(kody[10]).toBe(429);
  });

  it('perKonto: dwa konta z jednego IP (biuro za NAT-em) mają osobne limity', async () => {
    process.env.JWT_SECRET = 'sekret-testowy';
    const jwt = new JwtService({ secret: 'sekret-testowy' });
    const a = jwt.sign({ sub: 'konto-a' });
    const b = jwt.sign({ sub: 'konto-b' });
    const g = guard({ limit: 1, windowMs: 3_600_000, scope: 'subscriptions:create', tylkoUdane: true, perKonto: true });
    expect(await proba(g, '9.9.9.9', 201, a)).toBe(201);
    expect(await proba(g, '9.9.9.9', 201, a)).toBe(429);
    expect(await proba(g, '9.9.9.9', 201, b)).toBe(201);
    delete process.env.JWT_SECRET;
  });

  it('perKonto bez trybu „tylko udane” (2FA): zmiana IP nie omija limitu konta', async () => {
    process.env.JWT_SECRET = 'sekret-testowy';
    const t = new JwtService({ secret: 'sekret-testowy' }).sign({ sub: 'konto-x' });
    const g = guard({ limit: 2, windowMs: 900_000, scope: 'auth:2fa-disable', perKonto: true });
    const kody = [];
    for (const ip of ['1.0.0.1', '1.0.0.2', '1.0.0.3']) kody.push(await proba(g, ip, 401, t));
    expect(kody).toEqual([401, 401, 429]);
    delete process.env.JWT_SECRET;
  });

  it('429 podaje konkretny czas po polsku, nie „za chwilę”', async () => {
    const g = guard({ limit: 1, windowMs: 3_600_000, scope: 's' });
    await proba(g, '3.3.3.3', 200);
    const { ctx } = zadanie('3.3.3.3');
    await expect(g.canActivate(ctx)).rejects.toMatchObject({
      response: expect.objectContaining({ message: expect.stringMatching(/Spróbuj ponownie za 60 minut\./) }),
    });
  });
});

describe('komunikatLimitu', () => {
  it('odmienia sekundy i minuty', () => {
    expect(komunikatLimitu(1)).toContain('za 1 sekundę');
    expect(komunikatLimitu(3)).toContain('za 3 sekundy');
    expect(komunikatLimitu(45)).toContain('za 45 sekund');
    expect(komunikatLimitu(60)).toContain('za 1 minutę');
    expect(komunikatLimitu(52 * 60)).toContain('za 52 minuty');
    expect(komunikatLimitu(13 * 60)).toContain('za 13 minut');
    expect(komunikatLimitu(3600)).toContain('za 60 minut');
    expect(komunikatLimitu(60)).toContain('kontakt@verris.pl');
    expect(komunikatLimitu(60)).not.toContain('za chwilę');
  });
});
