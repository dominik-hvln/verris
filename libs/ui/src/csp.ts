/**
 * CSP paneli (klienta, obsługi, admina) z nonce per żądanie — decyzja 09.10: panele teraz, www później.
 *
 * Wcześniej CSP dawał Caddy (blok `panel_headers`) ze `script-src 'unsafe-inline'`, więc każdy wstrzyknięty
 * `<script>` albo atrybut `onerror=` wykonałby się w panelu. Teraz CSP ustawia proxy/middleware aplikacji:
 * Next odczytuje `'nonce-…'` z nagłówka CSP żądania i dokleja go do swoich skryptów, a własne skrypty
 * inline (motyw, Consent Mode, GTM) dostają nonce z nagłówka `x-nonce`.
 *
 * `'strict-dynamic'`: skrypt z nonce może dociągać kolejne (`document.createElement('script')`) — tak ładują się
 * gtm.js, fbevents.js (po zgodzie z banera) i captcha. Przeglądarki z CSP3 ignorują wtedy listę hostów
 * i `'self'` w script-src; zostają one wyłącznie jako zapas dla starszych przeglądarek (CSP2).
 *
 * style-src zostaje z `'unsafe-inline'`: panele mają atrybuty `style={…}` (React) i biblioteki wstrzykujące
 * `<style>` (sonner, recharts) — nonce nie obejmuje atrybutów style. Wstrzyknięty styl nie wykonuje kodu.
 *
 * Plik nie importuje Reacta: ładuje go proxy/middleware (runtime bez DOM).
 */

/** Pozostałe dyrektywy — bez zmian względem dotychczasowego bloku `panel_headers` w ops/caddy/Caddyfile. */
const DYREKTYWY_STALE: ReadonlyArray<string> = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // form-action *.verris.pl: webmail skrzynki jednym kliknięciem wysyła formularz POST z tokenem do Roundcube
  // na węźle (https://<węzeł>.verris.pl/roundcube/direct_login/) — retest D3 29.09.
  "form-action 'self' https://www.facebook.com https://*.verris.pl",
  // img-src `https:` pokrywa piksele zliczające (google-analytics collect, facebook /tr).
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // wss://*.hetzner.cloud: konsola VPS (noVNC) łączy się z websocketem z request_console (D3 06.10).
  "connect-src 'self' https://api.verris.pl wss://*.hetzner.cloud https://*.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.doubleclick.net https://*.googlesyndication.com https://www.googleadservices.com https://www.google.com https://www.facebook.com",
  "frame-src https://js.stripe.com https://hooks.stripe.com https://td.doubleclick.net https://www.googletagmanager.com https://www.facebook.com https://api.verris.pl",
];

/** Zapas dla przeglądarek bez `'strict-dynamic'` (CSP2) — CSP3 tę listę ignoruje. */
const SKRYPTY_ZAPAS = "'self' https://js.stripe.com https://*.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://connect.facebook.net";

/** Losowy nonce (128 bitów, base64) — Web Crypto działa i w runtime Node, i Edge. */
export function nowyNonce(): string {
  const bajty = new Uint8Array(16);
  crypto.getRandomValues(bajty);
  let s = "";
  for (const b of bajty) s += String.fromCharCode(b);
  return btoa(s);
}

/** Dyrektywy, w których lokalne API (`pnpm dev`, http://localhost:3000) musi być dozwolone w trybie deweloperskim. */
const DYREKTYWY_Z_API_DEV = ["connect-src ", "img-src ", "frame-src "];

/** Origin API z `NEXT_PUBLIC_API_URL` (LOCAL_DEV.md: http://localhost:3000) — używany tylko przy `dev`. */
function originApiDev(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").origin;
  } catch {
    return "http://localhost:3000";
  }
}

/**
 * Nagłówek Content-Security-Policy paneli dla danego nonce. `dev` dokłada `'unsafe-eval'` (React w trybie
 * deweloperskim odtwarza stosy błędów przez eval) oraz origin lokalnego API do connect/img/frame-src —
 * przed 09.10 CSP dawał tylko Caddy, więc `next dev` działał bez CSP, a przeglądarka woła API wprost
 * (logowanie kluczem dostępu: passkey-client.ts, podgląd badge). Nigdy w produkcji.
 */
export function cspPanelu(nonce: string, dev = false): string {
  const skrypty = `script-src 'nonce-${nonce}' 'strict-dynamic' ${SKRYPTY_ZAPAS}${dev ? " 'unsafe-eval'" : ""}`;
  const api = dev ? originApiDev() : "";
  const stale = dev ? DYREKTYWY_STALE.map((d) => (DYREKTYWY_Z_API_DEV.some((p) => d.startsWith(p)) ? `${d} ${api}` : d)) : DYREKTYWY_STALE;
  return [...stale, skrypty].join("; ");
}

/**
 * Nagłówki żądania do przekazania dalej (`NextResponse.next({ request: { headers } })`) i wartość CSP
 * odpowiedzi. Nadpisuje ewentualne `x-nonce`/CSP przysłane przez klienta.
 */
export function naglowkiCsp(zadanie: Headers, dev = process.env.NODE_ENV === "development"): { headers: Headers; csp: string; nonce: string } {
  const nonce = nowyNonce();
  const csp = cspPanelu(nonce, dev);
  const headers = new Headers(zadanie);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  return { headers, csp, nonce };
}
