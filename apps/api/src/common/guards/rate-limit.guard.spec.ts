import { HttpException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { MAX_BUCKETS, RATE_LIMIT_KEY, RATE_LIMIT_SKIP_KEY, RateLimitGuard, type RateLimitOptions } from './rate-limit.guard.js';

/** G-20 — dowód D2 dla strażnika, który chroni logowanie przed atakiem słownikowym. */
const LOGIN: RateLimitOptions = { limit: 3, windowMs: 60_000, scope: 'auth:login', keyByBodyField: 'email' };

function guardWith(meta: { options?: RateLimitOptions; skip?: boolean }) {
  delete process.env.REDIS_URL;
  const reflector = {
    getAllAndOverride: (key: string) => (key === RATE_LIMIT_KEY ? meta.options : key === RATE_LIMIT_SKIP_KEY ? meta.skip : undefined),
  } as unknown as Reflector;
  return new RateLimitGuard(reflector);
}

const ctx = (ip: string, body: Record<string, unknown> = {}) =>
  ({
    getType: () => 'http',
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => ({ ip, body, method: 'POST', path: '/auth/login', route: { path: '/auth/login' } }) }),
  }) as unknown as ExecutionContext;

async function status(g: RateLimitGuard, c: ExecutionContext): Promise<number> {
  try {
    await g.canActivate(c);
    return 200;
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : 500;
  }
}

describe('G-20 RateLimitGuard', () => {
  afterEach(() => vi.useRealTimers());

  it('po limicie z jednego IP zwraca 429 z czasem ponowienia', async () => {
    const g = guardWith({ options: LOGIN });
    for (let i = 0; i < 3; i++) expect(await status(g, ctx('1.1.1.1', { email: `a${i}@x.pl` }))).toBe(200);
    await expect(g.canActivate(ctx('1.1.1.1', { email: 'z@x.pl' }))).rejects.toMatchObject({
      response: expect.objectContaining({ retryAfterSeconds: expect.any(Number) }),
    });
  });

  it('atak na jedno konto z wielu IP blokuje licznik per e-mail (wielkość liter bez znaczenia)', async () => {
    const g = guardWith({ options: LOGIN });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push(await status(g, ctx(`10.0.0.${i}`, { email: i % 2 ? 'Ofiara@X.pl ' : 'ofiara@x.pl' })));
    expect(codes).toEqual([200, 200, 200, 429, 429]);
  });

  it('okno się resetuje', async () => {
    vi.useFakeTimers();
    const g = guardWith({ options: LOGIN });
    for (let i = 0; i < 3; i++) await status(g, ctx('2.2.2.2'));
    expect(await status(g, ctx('2.2.2.2'))).toBe(429);
    vi.advanceTimersByTime(60_001);
    expect(await status(g, ctx('2.2.2.2'))).toBe(200);
  });

  it('zakresy są niezależne, a @SkipRateLimit omija limit', async () => {
    const a = guardWith({ options: { ...LOGIN, scope: 'a' } });
    for (let i = 0; i < 3; i++) await status(a, ctx('3.3.3.3'));
    expect(await status(a, ctx('3.3.3.3'))).toBe(429);
    const b = guardWith({ options: { ...LOGIN, scope: 'b' } });
    expect(await status(b, ctx('3.3.3.3'))).toBe(200);
    const skip = guardWith({ options: { ...LOGIN, limit: 0 }, skip: true });
    expect(await status(skip, ctx('3.3.3.3'))).toBe(200);
  });

  it('przepełnienie mapy nie zeruje liczników (fail-closed dla nowych kluczy)', async () => {
    const g = guardWith({ options: LOGIN });
    for (let i = 0; i < 3; i++) await status(g, ctx('4.4.4.4', { email: 'ofiara@x.pl' }));
    expect(await status(g, ctx('4.4.4.5', { email: 'ofiara@x.pl' }))).toBe(429);
    // Zalanie mapy losowymi kluczami (żywymi, nie wygasłymi).
    const buckets = (g as unknown as { buckets: Map<string, { count: number; resetAt: number }> }).buckets;
    for (let i = buckets.size; i < MAX_BUCKETS; i++) buckets.set(`flood:${i}`, { count: 1, resetAt: Date.now() + 60_000 });
    expect(await status(g, ctx('9.9.9.9', { email: 'nowy@x.pl' }))).toBe(429);
    expect(await status(g, ctx('4.4.4.6', { email: 'ofiara@x.pl' }))).toBe(429);
  });

  it('awaria Redisa przełącza na licznik w pamięci zamiast przepuszczać ruch', async () => {
    const g = guardWith({ options: LOGIN });
    const inner = g as unknown as { redis: unknown; redisHealthy: boolean };
    inner.redis = { incr: vi.fn().mockRejectedValue(new Error('ECONNRESET')), disconnect: vi.fn() };
    inner.redisHealthy = true;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push(await status(g, ctx('5.5.5.5')));
    expect(codes).toEqual([200, 200, 200, 429]);
  });
});
