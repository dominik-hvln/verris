import { NextRequest } from 'next/server';

jest.mock('@/lib/session-profile', () => ({
  fetchSessionProfileState: jest.fn(async () => ({ profile: null, unauthorized: false })),
}));

import { middleware } from './middleware';
import { cspPanelu } from '@verris/ui/csp';

/** API chwilowo nie odpowiada na /users/me: strona → 503 z komunikatem, akcja serwera → dalej (API ją oceni). */
describe('middleware przy niedostępnym API', () => {
  const zadanie = (naglowki: Record<string, string> = {}) =>
    new NextRequest('http://localhost:3001/dashboard/services', { headers: { cookie: 'auth_token=t', ...naglowki } });

  it('nawigacja dostaje stronę „Panel chwilowo niedostępny” (503), sesja zostaje', async () => {
    const res = await middleware(zadanie());
    expect(res.status).toBe(503);
    expect(res.cookies.get('auth_token')).toBeUndefined();
  });

  it('akcja serwera przechodzi dalej zamiast HTML-a, którego klient Next nie umie odczytać', async () => {
    const res = await middleware(zadanie({ 'next-action': 'abc' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });
});

/** Impersonacja z tej samej przeglądarki: po jej końcu wraca odłożona sesja właściciela. */
describe('middleware — sesja właściciela po impersonacji', () => {
  const { fetchSessionProfileState } = jest.requireMock('@/lib/session-profile') as { fetchSessionProfileState: jest.Mock };
  const zadanie = (cookie: string) => new NextRequest('http://localhost:3001/dashboard/services?x=1', { headers: { cookie } });

  it('impersonacja wygasła (brak auth_token): sesja właściciela wraca, bez logowania', async () => {
    const res = await middleware(zadanie('auth_token_wlasciciel=wl; impersonation_operator=admin'));
    expect(res.headers.get('location')).toBe('http://localhost:3001/dashboard/services?x=1');
    expect(res.cookies.get('auth_token')?.value).toBe('wl');
    expect(res.cookies.get('auth_token_wlasciciel')?.value).toBe('');
  });

  it('API odrzuca token impersonacji: też wraca właściciel', async () => {
    fetchSessionProfileState.mockResolvedValueOnce({ profile: null, unauthorized: true });
    const res = await middleware(zadanie('auth_token=imp; auth_token_wlasciciel=wl'));
    expect(res.cookies.get('auth_token')?.value).toBe('wl');
  });

  it('bez odłożonej sesji: odrzucony token → logowanie jak dotąd', async () => {
    fetchSessionProfileState.mockResolvedValueOnce({ profile: null, unauthorized: true });
    const res = await middleware(zadanie('auth_token=imp'));
    expect(res.headers.get('location')).toContain('/login?reason=session-ended');
  });
});

/** PB-45 — link z maila (zgoda na migracji) bez sesji: po zalogowaniu klient wraca na tę samą stronę. */
describe('middleware — powrót po zalogowaniu (next)', () => {
  const { fetchSessionProfileState } = jest.requireMock('@/lib/session-profile') as { fetchSessionProfileState: jest.Mock };
  const link = '/dashboard/migrations/zgoda?serviceId=s1&id=m1&token=abc_-123';

  it('bez sesji: /login z next = ścieżka z parametrami (serviceId, id, token)', async () => {
    const res = await middleware(new NextRequest(`http://localhost:3001${link}`));
    const cel = new URL(res.headers.get('location')!);
    expect(cel.pathname).toBe('/login');
    expect(cel.searchParams.get('next')).toBe(link);
  });

  it('wygasła sesja: reason=session-ended i ten sam next', async () => {
    fetchSessionProfileState.mockResolvedValueOnce({ profile: null, unauthorized: true });
    const res = await middleware(new NextRequest(`http://localhost:3001${link}`, { headers: { cookie: 'auth_token=stary' } }));
    const cel = new URL(res.headers.get('location')!);
    expect(cel.searchParams.get('reason')).toBe('session-ended');
    expect(cel.searchParams.get('next')).toBe(link);
  });

  it('zalogowany na /login?next=…: prosto na next, obcy adres → /dashboard', async () => {
    const dobry = await middleware(
      new NextRequest(`http://localhost:3001/login?next=${encodeURIComponent(link)}`, { headers: { cookie: 'auth_token=t' } }),
    );
    expect(dobry.headers.get('location')).toBe(`http://localhost:3001${link}`);
    const zly = await middleware(
      new NextRequest(`http://localhost:3001/login?next=${encodeURIComponent('//zly.example/x')}`, { headers: { cookie: 'auth_token=t' } }),
    );
    expect(zly.headers.get('location')).toBe('http://localhost:3001/dashboard');
  });
});

/**
 * CSP z nonce (09.10) — wcześniej Caddy dawał `script-src 'unsafe-inline'`. Middleware ustawia CSP na
 * odpowiedzi i przekazuje nonce dalej (nagłówek CSP żądania czyta Next, `x-nonce` czyta layout).
 */
describe('middleware — CSP z nonce', () => {
  const scriptSrc = (csp: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';
  const nonceZ = (csp: string) => /'nonce-([^']+)'/.exec(scriptSrc(csp))?.[1];
  const strona = (naglowki: Record<string, string> = {}) =>
    middleware(new NextRequest('http://localhost:3001/login', { headers: naglowki }));

  it('strona dostaje CSP z nonce i strict-dynamic, bez unsafe-inline w script-src', async () => {
    const res = await strona();
    const csp = res.headers.get('content-security-policy') ?? '';
    expect(nonceZ(csp)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(scriptSrc(csp)).toContain("'strict-dynamic'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-eval'");
  });

  it('ten sam nonce trafia do żądania (x-nonce i CSP dla Nexta), przysłany przez klienta jest nadpisany', async () => {
    const res = await strona({ 'x-nonce': 'podrzucony', 'content-security-policy': "script-src 'unsafe-inline'" });
    const csp = res.headers.get('content-security-policy')!;
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceZ(csp));
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('nonce jest inny przy każdym żądaniu', async () => {
    const nonce = new Set<string | undefined>();
    for (let i = 0; i < 20; i++) nonce.add(nonceZ((await strona()).headers.get('content-security-policy')!));
    expect(nonce.size).toBe(20);
  });

  it('akcja serwera przy niedostępnym API też idzie z CSP', async () => {
    const res = await middleware(
      new NextRequest('http://localhost:3001/dashboard/services', { headers: { cookie: 'auth_token=t', 'next-action': 'abc' } }),
    );
    expect(nonceZ(res.headers.get('content-security-policy') ?? '')).toBeDefined();
  });

  // Przeniesione z apps/api/src/test/wdrozenie-caddy.spec.ts razem z CSP (wcześniej w ops/caddy/Caddyfile).
  it('form-action dopuszcza węzły *.verris.pl (webmail skrzynki: POST z tokenem do Roundcube), nic szerszego', async () => {
    const csp = (await strona()).headers.get('content-security-policy')!;
    const fa = /form-action ('self'[^;]+)/.exec(csp)?.[1] ?? '';
    expect(fa.split(' ')).toContain('https://*.verris.pl');
    expect(fa).not.toMatch(/\bhttps:(?!\/\/)|\*(?!\.verris\.pl)/);
  });

  it('connect-src dopuszcza websocket konsoli VPS (wss_url z request_console), tylko wss i tylko *.hetzner.cloud', async () => {
    const csp = (await strona()).headers.get('content-security-policy')!;
    const cs = /connect-src ([^;]+)/.exec(csp)?.[1] ?? '';
    expect(cs.split(' ')).toContain('wss://*.hetzner.cloud');
    expect(cs).not.toMatch(/(^| )wss:(?!\/\/\*\.hetzner\.cloud)/);
  });

  // `pnpm dev` (LOCAL_DEV.md): panel na :3001, API na http://localhost:3000, a przeglądarka woła API wprost
  // (passkey-client.ts, podgląd badge, obrazki). Przed 09.10 dev nie miał CSP (dawał go tylko Caddy).
  it('tryb deweloperski dopuszcza lokalne API w connect/img/frame-src, produkcja nie', () => {
    const dyrektywa = (csp: string, nazwa: string) => csp.split('; ').find((d) => d.startsWith(`${nazwa} `))?.split(' ') ?? [];
    const bylo = process.env.NEXT_PUBLIC_API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000/';
    const dev = cspPanelu('n', true);
    const prod = cspPanelu('n');
    if (bylo === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = bylo;
    for (const nazwa of ['connect-src', 'img-src', 'frame-src']) {
      expect(dyrektywa(dev, nazwa)).toContain('http://localhost:3000');
      expect(dyrektywa(prod, nazwa)).not.toContain('http://localhost:3000');
    }
    expect(prod).not.toContain('localhost');
    expect(dyrektywa(dev, 'script-src')).toContain("'unsafe-eval'");
    expect(dyrektywa(prod, 'script-src')).not.toContain("'unsafe-eval'");
  });
});
