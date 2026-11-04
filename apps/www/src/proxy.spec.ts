import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { cspWww } from '@/lib/csp';

/**
 * D12 (10.10) — CSP z nonce na verris.pl. Wcześniej Caddy dawał `script-src 'unsafe-inline'` dla całej domeny.
 * Proxy ustawia politykę na odpowiedzi i przekazuje nonce dalej (nagłówek CSP żądania czyta Next, `x-nonce` layout).
 * Panel Payload (/admin) i /api zostają przy dotychczasowej polityce z Caddy.
 */
const scriptSrc = (csp: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';
const nonceZ = (csp: string) => /'nonce-([^']+)'/.exec(scriptSrc(csp))?.[1];
const zadanie = (sciezka: string, naglowki: Record<string, string> = {}) =>
  proxy(new NextRequest(`http://localhost:3005${sciezka}`, { headers: naglowki }));

describe('proxy www — CSP z nonce', () => {
  it.each(['/', '/cennik', '/hosting/wordpress', '/blog/jak-przeniesc-strone', '/administracja'])(
    '%s: CSP z nonce i strict-dynamic, bez unsafe-inline w script-src',
    (sciezka) => {
      const csp = zadanie(sciezka).headers.get('content-security-policy') ?? '';
      expect(nonceZ(csp)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(scriptSrc(csp)).toContain("'strict-dynamic'");
      expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
      expect(scriptSrc(csp)).not.toContain("'unsafe-eval'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
    },
  );

  it('ten sam nonce trafia do żądania (x-nonce i CSP dla Nexta), przysłany przez klienta jest nadpisany', () => {
    const res = zadanie('/', { 'x-nonce': 'podrzucony', 'content-security-policy': "script-src 'unsafe-inline'" });
    const csp = res.headers.get('content-security-policy')!;
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceZ(csp));
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('nonce jest inny przy każdym żądaniu', () => {
    const nonce = new Set<string | undefined>();
    for (let i = 0; i < 20; i++) nonce.add(nonceZ(zadanie('/').headers.get('content-security-policy')!));
    expect(nonce.size).toBe(20);
  });

  it.each(['/admin', '/admin/collections/posts', '/api/users/me', '/api'])('%s (Payload): proxy nie ustawia CSP ani nonce', (sciezka) => {
    const res = zadanie(sciezka);
    expect(res.headers.get('content-security-policy')).toBeNull();
    expect(res.headers.get('x-middleware-request-x-nonce')).toBeNull();
  });

  it('dyrektywy poza script-src jak dotychczas w Caddy (GTM, Ads, Meta), bez Google Fonts (A2-03)', () => {
    const csp = cspWww('n');
    expect(csp).toContain("style-src 'self' 'unsafe-inline';");
    expect(csp).toContain("font-src 'self' data:;");
    expect(csp).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    expect(csp).toContain('frame-src https://td.doubleclick.net https://www.googletagmanager.com https://www.facebook.com');
    expect(csp).toMatch(/connect-src [^;]*https:\/\/\*\.google-analytics\.com[^;]*https:\/\/www\.facebook\.com/);
    expect(cspWww('n', true)).toContain("'unsafe-eval'");
  });
});
