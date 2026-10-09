import { NextRequest } from 'next/server';
import { proxy } from './proxy';

/** CSP z nonce (09.10) — wcześniej Caddy dawał `script-src 'unsafe-inline'`. */
describe('proxy — CSP z nonce', () => {
  const scriptSrc = (csp: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src ')) ?? '';
  const nonceZ = (csp: string) => /'nonce-([^']+)'/.exec(scriptSrc(csp))?.[1];
  const strona = (naglowki: Record<string, string> = {}) => proxy(new NextRequest('http://localhost/login', { headers: naglowki }));

  it('CSP z nonce i strict-dynamic, bez unsafe-inline/unsafe-eval w script-src', () => {
    const csp = strona().headers.get('content-security-policy') ?? '';
    expect(nonceZ(csp)).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(scriptSrc(csp)).toContain("'strict-dynamic'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-inline'");
    expect(scriptSrc(csp)).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it('ten sam nonce trafia do żądania (x-nonce i CSP dla Nexta), przysłany przez klienta jest nadpisany', () => {
    const res = strona({ 'x-nonce': 'podrzucony' });
    const csp = res.headers.get('content-security-policy')!;
    expect(res.headers.get('x-middleware-request-x-nonce')).toBe(nonceZ(csp));
    expect(res.headers.get('x-middleware-request-content-security-policy')).toBe(csp);
  });

  it('nonce jest inny przy każdym żądaniu', () => {
    const nonce = new Set(Array.from({ length: 20 }, () => nonceZ(strona().headers.get('content-security-policy')!)));
    expect(nonce.size).toBe(20);
  });
});
