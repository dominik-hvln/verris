"use client";

/**
 * Cookie consent state + Google Consent Mode v2 bridge.
 *
 * Legal basis: art. 399–402 PKE + Polityka cookies v1.0.0 (§3).
 * The `cookies_consent` cookie stores the user's choice for 12 months.
 *
 * Tag loading contract:
 *  - GTM (NEXT_PUBLIC_GTM_ID) is injected in the root layout ONLY after
 *    Consent Mode defaults are set to `denied` (see analytics-scripts.tsx).
 *    Tags inside GTM must respect consent signals (built-in consent checks).
 *  - Meta Pixel (NEXT_PUBLIC_META_PIXEL_ID) is initialised lazily from
 *    `applyConsent()` the first time `marketing` is granted, and revoked
 *    via fbq('consent','revoke') when withdrawn.
 */

export const CONSENT_COOKIE = "cookies_consent";
export const CONSENT_TTL_DAYS = 365;
export const CONSENT_VERSION = 1;

export interface CookieConsent {
  v: number;
  /** ISO timestamp of the decision (proof of consent). */
  ts: string;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export const OPEN_PREFERENCES_EVENT = "verris:cookie-preferences";
export const CONSENT_CHANGED_EVENT = "verris:cookie-consent-changed";

/**
 * Domena nadrzędna dla ciasteczka zgody — musi być identyczna z apps/www.
 *
 * Bez atrybutu `Domain` ciasteczko jest host-only, więc zgoda z `verris.pl` nie
 * obowiązuje na `panel.verris.pl`. Consent Mode zostaje wtedy `denied` i zdarzenia
 * `sign_up` / `purchase` nie docierają do GA4/Ads/Meta.
 */
export function consentCookieDomain(): string {
  if (typeof location === "undefined") return "";
  const host = location.hostname;
  const parts = host.split(".");
  if (parts.length < 2 || /^[0-9.]+$/.test(host)) return "";
  const base = parts.slice(-2).join(".");
  return host === base || host.endsWith(`.${base}`) ? `.${base}` : "";
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
  if (typeof document === "undefined") return null;
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as CookieConsent;
    if (parsed?.v !== CONSENT_VERSION) return null;
    return {
      v: CONSENT_VERSION,
      ts: String(parsed.ts ?? ""),
      functional: Boolean(parsed.functional),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
    };
  } catch {
    return null;
  }
}

export function writeConsent(
  choice: Pick<CookieConsent, "functional" | "analytics" | "marketing">,
): CookieConsent {
  const consent: CookieConsent = { v: CONSENT_VERSION, ts: new Date().toISOString(), ...choice };
  const expires = new Date(Date.now() + CONSENT_TTL_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  const domain = consentCookieDomain();

  // Skasuj starszy wariant host-only, żeby nie współistniał z domenowym.
  if (domain) {
    document.cookie = `${CONSENT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }

  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(consent))}; expires=${expires}; path=/${domain ? `; Domain=${domain}` : ""}; SameSite=Lax${secure}`;
  applyConsent(consent);
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: consent }));
  return consent;
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer || [];
  // GTM consumes `arguments` objects, not arrays — keep the canonical form.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments);
}

/** Push the user's choice into Consent Mode v2 + gate the Meta Pixel. */
export function applyConsent(consent: CookieConsent): void {
  gtag("consent", "update", {
    analytics_storage: consent.analytics ? "granted" : "denied",
    ad_storage: consent.marketing ? "granted" : "denied",
    ad_user_data: consent.marketing ? "granted" : "denied",
    ad_personalization: consent.marketing ? "granted" : "denied",
    functionality_storage: consent.functional ? "granted" : "denied",
    personalization_storage: consent.functional ? "granted" : "denied",
    security_storage: "granted",
  });
  // Zmienna `consent_state` w dataLayer — bez niej debugowanie „czemu tag nie odpalił"
  // sprowadza się do zgadywania.
  window.dataLayer?.push({
    event: "verris_consent_update",
    consent_state: {
      analytics: consent.analytics,
      marketing: consent.marketing,
      functional: consent.functional,
    },
  });

  // Wycofanie zgody marketingowej musi usunąć zahaszowany e-mail z dataLayer,
  // inaczej `user_data` zostaje w pamięci strony aż do przeładowania i tag
  // konwersji mógłby go jeszcze odczytać.
  if (!consent.marketing) window.dataLayer?.push({ user_data: null });

  syncMetaPixel(consent.marketing);
}

function syncMetaPixel(marketingGranted: boolean): void {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  if (!pixelId) return;

  if (!marketingGranted) {
    window.fbq?.("consent", "revoke");
    return;
  }

  if (window.fbq) {
    window.fbq("consent", "grant");
    return;
  }

  // Kanoniczny bootstrap Meta Pixela. KLUCZOWE: treść funkcji MUSI delegować do
  // `callMethod` po załadowaniu fbevents.js — inaczej zdarzenia lądują tylko w
  // kolejce i nie są wysyłane (Pixel Helper: „No pixels found").
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
  n.version = "2.0";
  n.queue = [];
  window.fbq = n as unknown as NonNullable<Window["fbq"]>;
  window._fbq = n;
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);
  window.fbq("consent", "grant");
  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

/** Categories that should be offered in the banner given configured tags. */
export function availableCategories(): { analytics: boolean; marketing: boolean } {
  const hasGtm = Boolean(process.env.NEXT_PUBLIC_GTM_ID);
  const hasPixel = Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID);
  return { analytics: hasGtm, marketing: hasGtm || hasPixel };
}
