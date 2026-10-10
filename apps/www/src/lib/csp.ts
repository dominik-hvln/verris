/**
 * CSP verris.pl z nonce per żądanie — decyzja D12 (10.10): www teraz, jak panele 09.10 (libs/ui/src/csp.ts).
 *
 * Wcześniej CSP dawał Caddy (blok WWW w ops/caddy/Caddyfile) ze `script-src 'unsafe-inline'`, więc każdy
 * wstrzyknięty `<script>` albo atrybut `onerror=` wykonałby się na stronie. Teraz politykę stron publicznych
 * ustawia proxy Next (src/proxy.ts): Next odczytuje `'nonce-…'` z nagłówka CSP żądania i dokleja go do swoich
 * skryptów, a Consent Mode i loader GTM (components/Analytics.tsx) dostają nonce z nagłówka `x-nonce`.
 * https://nextjs.org/docs/app/guides/content-security-policy
 *
 * `'strict-dynamic'`: skrypt z nonce może dociągać kolejne przez `document.createElement('script')` — tak ładują
 * się gtm.js (loader GTM), tagi GTM-PJQNXCF5 (wyłącznie __gaawe, __googtag, __gclidw — gtag.js przez createElement,
 * bez „Niestandardowego kodu HTML”) i fbevents.js (lib/cookie-consent.ts po zgodzie marketingowej).
 * Przeglądarki z CSP3 ignorują wtedy listę hostów i `'self'` w script-src — zostają jako zapas dla CSP2.
 *
 * Panel Payload (/admin) i API Payload (/api) NIE dostają tej polityki (proxy je pomija): Caddy daje im
 * dotychczasową politykę jako wartość domyślną (`?Content-Security-Policy`) — bez zmian dla CMS.
 *
 * style-src zostaje z `'unsafe-inline'` (atrybuty style={…}; nonce nie obejmuje atrybutów). Styl nie wykonuje kodu.
 * Plik nie importuje Reacta: ładuje go proxy (runtime bez DOM).
 */

/** Dyrektywy poza script-src — 1:1 z dotychczasowej polityki www w ops/caddy/Caddyfile. */
const DYREKTYWY_STALE: ReadonlyArray<string> = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://www.facebook.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.doubleclick.net https://*.googlesyndication.com https://www.googleadservices.com https://www.google.com https://www.facebook.com https://connect.facebook.net",
  "frame-src https://td.doubleclick.net https://www.googletagmanager.com https://www.facebook.com",
];

/** Zapas dla przeglądarek bez `'strict-dynamic'` (CSP2) — dotychczasowe hosty, CSP3 tę listę ignoruje. */
const SKRYPTY_ZAPAS =
  "'self' https://*.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://connect.facebook.net";

/** Losowy nonce (128 bitów, base64) — Web Crypto działa w runtime Node i Edge. */
export function nowyNonce(): string {
  const bajty = new Uint8Array(16);
  crypto.getRandomValues(bajty);
  let s = '';
  for (const b of bajty) s += String.fromCharCode(b);
  return btoa(s);
}

/** Polityka stron publicznych dla danego nonce. `dev` dokłada `'unsafe-eval'` (stosy błędów Reacta) — nigdy w produkcji. */
export function cspWww(nonce: string, dev = false): string {
  return [...DYREKTYWY_STALE, `script-src 'nonce-${nonce}' 'strict-dynamic' ${SKRYPTY_ZAPAS}${dev ? " 'unsafe-eval'" : ''}`].join('; ');
}

/** Trasy Payload (panel CMS i jego API) — zostają przy polityce z Caddy, proxy ich nie dotyka. */
export function trasaPayload(sciezka: string): boolean {
  return /^\/(admin|api)(\/|$)/.test(sciezka);
}
