import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { naglowkiCsp } from "@verris/ui/csp";

/**
 * CSP z nonce per żądanie (bez `'unsafe-inline'` w script-src) — wcześniej dawał go Caddy (`panel_headers`).
 * Next czyta nonce z nagłówka CSP żądania i dokleja go do swoich skryptów; skrypt motywu w layoucie
 * bierze go z `x-nonce`. https://nextjs.org/docs/app/guides/content-security-policy
 */
export function proxy(request: NextRequest) {
  const { headers, csp } = naglowkiCsp(request.headers);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  // API (health, eksporty CSV/PDF) i pliki statyczne nie są stronami HTML — bez CSP z nonce.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|fonts/).*)"],
};
