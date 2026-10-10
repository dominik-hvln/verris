import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { cspWww, nowyNonce, trasaPayload } from '@/lib/csp';

/**
 * D12 (10.10) — CSP z nonce per żądanie na stronach publicznych verris.pl (bez `'unsafe-inline'` w script-src).
 * Next czyta nonce z nagłówka CSP żądania i dokleja go do swoich skryptów; layout bierze go z `x-nonce`
 * (to wymusza render dynamiczny — wymóg nonce). Przysłane przez klienta `x-nonce`/CSP są nadpisywane.
 * Panel Payload (/admin) i /api zostają bez zmian — politykę daje im Caddy (wartość domyślna `?`).
 * https://nextjs.org/docs/app/guides/content-security-policy
 */
export function proxy(request: NextRequest) {
  if (trasaPayload(request.nextUrl.pathname)) return NextResponse.next();
  const nonce = nowyNonce();
  const csp = cspWww(nonce, process.env.NODE_ENV === 'development');
  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set('Content-Security-Policy', csp);
  return res;
}

export const config = {
  // Pliki statyczne nie są stronami HTML — bez CSP z nonce (Caddy daje im politykę domyślną).
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
