'use client';

/**
 * Stan zgód cookie + most do Google Consent Mode v2 — spójny z panelem
 * (apps/client-panel/src/lib/cookie-consent.ts).
 *
 * Podstawa prawna: art. 399–402 PKE + Polityka cookies v1.0.0 (§3), art. 7 ust. 3 RODO.
 * Cookie `cookies_consent` przechowuje decyzję przez 12 miesięcy (dowód zgody: pole `ts`).
 *
 * Kontrakt ładowania tagów — decyzja 22 Dominika (4.11.2026): Consent Mode v2 w trybie PODSTAWOWYM.
 * https://developers.google.com/tag-platform/security/guides/consent („basic consent mode”: tagi Google
 * ładują się dopiero po interakcji z banerem i zgodzie; przed zgodą do Google nie wychodzi nic).
 *  - Skrypt inline (Analytics.tsx) ustawia tylko Consent Mode default = denied w dataLayer — bez żądań sieciowych.
 *  - GTM (gtm.js) wstrzykuje applyConsent() dopiero po zgodzie analitycznej albo marketingowej
 *    (zaladujTagiGoogle), PO wypchnięciu `consent update` — kontener startuje ze stanem z banera.
 *  - Meta Pixel ładowany leniwie z applyConsent() przy pierwszej zgodzie marketingowej,
 *    a wycofywany przez fbq('consent','revoke').
 *  - Wycofanie zgody: `consent update` = denied od razu; od następnego wejścia nic się nie ładuje.
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

// Sygnatura z parametrem rest jest tylko dla wywołujących — ciało czyta `arguments`.
const gtag: (...args: unknown[]) => void = function () {
  window.dataLayer = window.dataLayer || [];
  // GTM oczekuje obiektu `arguments`, nie tablicy — trzymamy kanoniczną formę.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
};

/** Przekazuje decyzję użytkownika do Consent Mode v2 i steruje Meta Pixel. */
export function applyConsent(consent: CookieConsent, zmiana = true): void {
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
  // Zdarzenie tylko przy ZMIANIE decyzji. Odtworzenie zapisanej zgody przy wejściu (zmiana=false)
  // załatwia skrypt inline przed GTM — zdarzenie przy każdej odsłonie odpalałoby tag Google
  // drugi raz (wyzwalacz verris_consent_update w GTM) i dublowało page_view.
  if (zmiana) window.dataLayer?.push({
    event: 'verris_consent_update',
    consent_state: {
      analytics: consent.analytics,
      marketing: consent.marketing,
      functional: consent.functional,
    },
  });
  if (!consent.marketing) window.dataLayer?.push({ user_data: null });
  if (wolnoLadowacTagiGoogle(consent)) zaladujTagiGoogle();
  syncMetaPixel(consent.marketing);
  // Po zgodzie marketingowej dopilnuj cookie `_fbc` (Facebook click ID) dla ruchu
  // z reklam — podnosi EMQ i dokłada konwersje w CAPI. Cookie marketingowe → tylko po zgodzie.
  if (consent.marketing) ensureFbc();
}

/**
 * Decyzja 22 — tagi Google (GTM i wszystko, co ładuje kontener) tylko po zgodzie na pomiar albo reklamy. Sama zgoda
 * „Funkcjonalne” steruje wyłącznie sygnałami Google i bez tamtych nie ładuje niczego.
 */
export function wolnoLadowacTagiGoogle(zgoda: Pick<CookieConsent, 'analytics' | 'marketing'> | null): boolean {
  return Boolean(zgoda && (zgoda.analytics || zgoda.marketing));
}

const GTM_SRC = 'https://www.googletagmanager.com/gtm.js';

/**
 * Kanoniczny loader GTM (https://developers.google.com/tag-platform/tag-manager/web) wykonany z kodu zamiast skryptu
 * inline — dopiero po zgodzie. Nonce strony przekazujemy gtm.js (wariant Google dla CSP z nonce:
 * https://developers.google.com/tag-platform/security/guides/csp); sam gtm.js przechodzi też przez 'strict-dynamic'.
 * Jednokrotnie: drugi raz nic nie robi (sprawdza, czy gtm.js jest już na stronie).
 */
export function zaladujTagiGoogle(): void {
  const id = process.env.NEXT_PUBLIC_GTM_ID;
  if (!id || typeof document === 'undefined') return;
  if (document.querySelector(`script[src^="${GTM_SRC}"]`)) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  const skrypt = document.createElement('script');
  skrypt.async = true;
  skrypt.src = `${GTM_SRC}?id=${encodeURIComponent(id)}`;
  const zNonce = document.querySelector<HTMLElement>('[nonce]');
  const nonce = zNonce ? zNonce.nonce || zNonce.getAttribute('nonce') : null;
  if (nonce) skrypt.setAttribute('nonce', nonce);
  document.head.appendChild(skrypt);
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
    if (n.callMethod) n.callMethod(...args);
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
  // Bez automatycznych zdarzeń Meta (klik w przycisk z jego tekstem, metadane strony) — wysyłamy tylko
  // własne zdarzenia. W panelu klient klika w nazwy domen, plików i skrzynek. Musi być przed init:
  // https://developers.facebook.com/docs/meta-pixel/advanced/#automatic-configuration
  window.fbq('set', 'autoConfig', false, pixelId);
  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}

/**
 * A2-04/A2-05 (beta 3.11) + decyzja 22 Dominika (4.11): Consent Mode v2 w trybie podstawowym (GTM i Meta Pixel ładują
 * się dopiero po zgodzie, przed nią do Google i Meta nie wychodzi nic). Baner i ustawienia mówią to wprost, a każda
 * kategoria opisuje to, co faktycznie zapisuje verris.pl — lista plików i kluczy przeglądarki:
 *  - niezbędne: cookie `cookies_consent` (decyzja, 12 mies.); sessionStorage `verris:mobilny-pasek-ukryty` (ukryty
 *    pasek ceny), `verris:asystent` (rozmowa z asystentem, tylko gdy asystent działa i coś napiszesz);
 *  - analityczne / marketingowe / funkcjonalne: pliki narzędzi Google i Meta (GTM-PJQNXCF5, Meta Pixel), `_fbc`,
 *    sessionStorage `verris-beta-utm` (źródło kampanii przy formularzu /beta — tylko po zgodzie analitycznej albo
 *    marketingowej, inaczej UTM tylko z adresu strony).
 * Treść polityki cookies (docs/legal) aktualizuje osobno dokument 1.1.0 — ten opis ma być z nią zgodny.
 */
export const OPIS_KATEGORII = {
  niezbedne:
    'Zapis Twojej decyzji o cookies (12 miesięcy) i udogodnienia, o które prosisz: ukrycie paska z ceną i rozmowa z asystentem w tej karcie przeglądarki. Zawsze aktywne.',
  funkcjonalne:
    'Pozwalają narzędziom Google zapamiętać ustawienia i dopasować treści (sygnały functionality_storage i personalization_storage) — działają tylko razem ze zgodą na pomiar albo reklamy. Sam serwis verris.pl nie zapisuje w tej kategorii nic więcej.',
  analityczne:
    'Pomiar korzystania z serwisu: Google Analytics przez Google Tag Manager (pliki _ga) oraz zapamiętanie źródła kampanii przy formularzu zgłoszenia do testów.',
  marketingowe:
    'Pomiar i dopasowanie reklam: tagi reklamowe Google, Meta Pixel (pliki _fbp i _fbc).',
  /** Tryb podstawowy Consent Mode (decyzja 22) — co się dzieje przed decyzją. */
  przedDecyzja:
    'Dopóki się nie zgodzisz, nie ładujemy narzędzi Google ani Meta — Twoja przeglądarka nic do nich nie wysyła.',
} as const;

/** Czy wolno zapamiętać UTM w sessionStorage (formularz /beta) — tylko po zgodzie analitycznej albo marketingowej. */
export function wolnoZapamietacUtm(zgoda: Pick<CookieConsent, 'analytics' | 'marketing'> | null): boolean {
  return Boolean(zgoda && (zgoda.analytics || zgoda.marketing));
}

/** Kategorie oferowane w banerze zależnie od skonfigurowanych tagów. */
export function availableCategories(): { analytics: boolean; marketing: boolean } {
  const hasGtm = Boolean(process.env.NEXT_PUBLIC_GTM_ID);
  const hasPixel = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  return { analytics: hasGtm, marketing: hasGtm || hasPixel };
}
