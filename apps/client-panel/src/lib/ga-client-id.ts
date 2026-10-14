/**
 * 14.10 — identyfikator klienta GA4 do pomiaru zakupu kartą z serwera (Measurement Protocol, apps/api
 * subscriptions/pomiar-zakupu.ts). Zwraca go TYLKO przy zgodzie na analitykę (ciasteczko `cookies_consent`,
 * ta sama wersja co w lib/cookie-consent.ts) — bez zgody zakup kartą nie trafia do GA4, tak jak w przeglądarce.
 *
 * `_ga` ma postać `GA1.<n>.<losowa>.<znacznik czasu>`; client_id GA4 to dwie ostatnie części.
 */
import { CONSENT_COOKIE, CONSENT_VERSION } from './cookie-consent-stale';

export function gaClientIdZeZgoda(ciasteczko: (nazwa: string) => string | undefined): string | undefined {
  const zgodaRaw = ciasteczko(CONSENT_COOKIE);
  if (!zgodaRaw) return undefined;
  try {
    const zgoda = JSON.parse(decodeURIComponent(zgodaRaw)) as { v?: number; analytics?: boolean };
    if (zgoda?.v !== CONSENT_VERSION || zgoda.analytics !== true) return undefined;
  } catch {
    return undefined;
  }
  const ga = ciasteczko('_ga');
  const m = ga ? /^GA\d+\.\d+\.(\d{1,20}\.\d{1,20})$/.exec(ga.trim()) : null;
  return m?.[1];
}
