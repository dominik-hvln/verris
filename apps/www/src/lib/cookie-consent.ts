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
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(
    JSON.stringify(consent),
  )}; expires=${expires}; path=/; SameSite=Lax${secure}`;
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
  window.dataLayer?.push({ event: 'verris_consent_update' });
  syncMetaPixel(consent.marketing);
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

  const fbq: NonNullable<Window['fbq']> = Object.assign(
    function (this: unknown, ...args: unknown[]) {
      fbq.queue!.push(args);
    },
    { queue: [] as unknown[], loaded: true, version: '2.0' },
  );
  window.fbq = fbq;
  window._fbq = fbq;
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
