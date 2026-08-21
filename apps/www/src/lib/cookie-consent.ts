'use client';

/**
 * Stan zgód cookie + most do Google Consent Mode v2 — spójny z panelem
 * (apps/client-panel/src/lib/cookie-consent.ts).
 *
 * Podstawa prawna: art. 399–402 PKE + Polityka cookies v1.0.0 (§3), art. 7 ust. 3 RODO.
 * Cookie `cookies_consent` przechowuje decyzję przez 12 miesięcy (dowód zgody: pole `ts`).
 *
 * Kontrakt ładowania tagów:
 *  - GTM wstrzykiwany dopiero po ustawieniu Consent Mode default = denied (Analytics.tsx).
 *  - Meta Pixel ładowany leniwie z applyConsent() przy pierwszej zgodzie marketingowej,
 *    a wycofywany przez fbq('consent','revoke').
 */

export const CONSENT_COOKIE = 'cookies_consent';
export const CONSENT_TTL_DAYS = 365;
export const CONSENT_VERSION = 1;

export interface CookieConsent {
  v: number;
  ts: string;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export const OPEN_PREFERENCES_EVENT = 'verris:cookie-preferences';
export const CONSENT_CHANGED_EVENT = 'verris:cookie-consent-changed';

/**
 * Domena nadrzędna dla ciasteczka zgody.
 *
 * Bez atrybutu `Domain` ciasteczko jest host-only: zgoda wyrażona na `verris.pl`
 * NIE jest widoczna na `panel.verris.pl`. Skutek: panel pyta drugi raz, Consent Mode
 * zostaje `denied`, a zdarzenia dołu lejka (`sign_up`, `purchase`) nigdy nie docierają
 * do GA4/Ads/Meta. Ustawiamy `Domain=.verris.pl`, żeby zgoda obowiązywała w całej domenie.
 *
 * Zwraca '' dla localhost i podglądów (adres IP, *.vercel.app itp.) — tam host-only jest poprawne.
 */
export function consentCookieDomain(): string {
  if (typeof location === 'undefined') return '';
  const host = location.hostname;
  const parts = host.split('.');
  // localhost / adres IP / pojedynczy label — bez atrybutu Domain.
  if (parts.length < 2 || /^[0-9.]+$/.test(host)) return '';
  const base = parts.slice(-2).join('.');
  return host === base || host.endsWith(`.${base}`) ? `.${base}` : '';
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: unknown;
  }
}

export function readConsent(): CookieConsent | null {
  if (typeof document === 'undefined') return null;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as CookieConsent;
    if (parsed?.v !== CONSENT_VERSION) return null;
    return {
      v: CONSENT_VERSION,
      ts: String(parsed.ts ?? ''),
      functional: Boolean(parsed.functional),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
    };
  } catch {
    return null;
  }
}

export function writeConsent(
  choice: Pick<CookieConsent, 'functional' | 'analytics' | 'marketing'>,
): CookieConsent {
  const consent: CookieConsent = { v: CONSENT_VERSION, ts: new Date().toISOString(), ...choice };
  const expires = new Date(Date.now() + CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  const domain = consentCookieDomain();

  // Skasuj starszy wariant host-only. Inaczej po wdrożeniu współistniałyby dwa
  // ciasteczka o tej samej nazwie (host-only + domenowe), a `document.cookie`
  // nie ujawnia ich zakresu — odczyt trafiałby na przypadkowe.
  if (domain) {
    document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }

  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
    JSON.stringify(consent),
  )}; expires=${expires}; path=/${domain ? `; Domain=${domain}` : ''}; SameSite=Lax${secure}`;
  applyConsent(consent);
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: consent }));
  return consent;
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  // GTM oczekuje obiektu `arguments`, nie tablicy — trzymamy kanoniczną formę.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

/** Przekazuje decyzję użytkownika do Consent Mode v2 i steruje Meta Pixel. */
export function applyConsent(consent: CookieConsent): void {
  gtag('consent', 'update', {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: consent.marketing ? 'granted' : 'denied',
    ad_user_data: consent.marketing ? 'granted' : 'denied',
    ad_personalization: consent.marketing ? 'granted' : 'denied',
    functionality_storage: consent.functional ? 'granted' : 'denied',
    personalization_storage: consent.functional ? 'granted' : 'denied',
    security_storage: 'granted',
  });
  // Zmienna `consent_state` — spójna z panelem. Bez niej debugowanie „czemu tag
  // nie odpalił" sprowadza się do zgadywania.
  window.dataLayer?.push({
    event: 'verris_consent_update',
    consent_state: {
      analytics: consent.analytics,
      marketing: consent.marketing,
      functional: consent.functional,
    },
  });
  if (!consent.marketing) window.dataLayer?.push({ user_data: null });
  syncMetaPixel(consent.marketing);
  // Po zgodzie marketingowej dopilnuj cookie `_fbc` (Facebook click ID) dla ruchu
  // z reklam — podnosi EMQ i dokłada konwersje w CAPI. Cookie marketingowe → tylko po zgodzie.
  if (consent.marketing) ensureFbc();
}

// -----------------------------------------------------------------------------
// fbc (Facebook click ID) — dla ruchu z reklam Meta.
//
// Pixel ładuje się u nas dopiero po zgodzie (lazy). Jeśli użytkownik wejdzie z reklamy
// (`?fbclid=...`), ale zgodę wyrazi po przejściu dalej (SPA), URL może już nie mieć fbclid
// i Pixel nie ustawi `_fbc`. Dlatego przechwytujemy fbclid wcześnie (w pamięci, BEZ storage),
// a po zgodzie budujemy `_fbc` = fb.1.<ts>.<fbclid>. To rozwiązuje podpowiedź Meta
// „serwer nie wysyła fbc" bez żadnego SDK.
// -----------------------------------------------------------------------------

let capturedFbclid: string | null = null;

/** Wywołaj wcześnie (mount Analytics) — zapamiętuje fbclid z adresu wejścia. */
export function captureFbclid(): void {
  if (typeof location === 'undefined') return;
  const v = new URLSearchParams(location.search).get('fbclid');
  if (v) capturedFbclid = v;
}

function readRawCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function ensureFbc(): void {
  if (typeof document === 'undefined') return;
  if (readRawCookie('_fbc')) return; // Pixel/fbevents już ustawił — nie nadpisujemy
  const fbclid =
    capturedFbclid ||
    (typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('fbclid')
      : null);
  if (!fbclid) return;
  const domain = consentCookieDomain();
  const value = `fb.1.${Date.now()}.${fbclid}`;
  const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString(); // 90 dni (jak Pixel)
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `_fbc=${value}; expires=${expires}; path=/${domain ? `; Domain=${domain}` : ''}; SameSite=Lax${secure}`;
}

function syncMetaPixel(marketingGranted: boolean): void {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return;

  if (!marketingGranted) {
    window.fbq?.('consent', 'revoke');
    return;
  }
  if (window.fbq) {
    window.fbq('consent', 'grant');
    return;
  }

  // Kanoniczny bootstrap Meta Pixela. KLUCZOWE: treść funkcji MUSI delegować do
  // `callMethod` po załadowaniu fbevents.js — inaczej wszystkie wywołania lądują
  // tylko w kolejce i nigdy nie są wysyłane (`init` przetwarza się przy flushu,
  // ale PageView i zdarzenia — nie; Pixel Helper pokazuje „No pixels found").
  type FbqStub = ((...args: unknown[]) => void) & {
    callMethod?: (...a: unknown[]) => void;
    queue: unknown[];
    push?: unknown;
    loaded: boolean;
    version: string;
  };
  const n = function (this: unknown, ...args: unknown[]) {
    if (n.callMethod) n.callMethod.apply(n, args);
    else n.queue.push(args);
  } as FbqStub;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  window.fbq = n as unknown as NonNullable<Window['fbq']>;
  window._fbq = n;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);
  window.fbq('consent', 'grant');
  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}

/** Kategorie oferowane w banerze zależnie od skonfigurowanych tagów. */
export function availableCategories(): { analytics: boolean; marketing: boolean } {
  const hasGtm = Boolean(process.env.NEXT_PUBLIC_GTM_ID);
  const hasPixel = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  return { analytics: hasGtm, marketing: hasGtm || hasPixel };
}
