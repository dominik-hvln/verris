import Script from "next/script";

// Consent Mode v2: https://developers.google.com/tag-platform/security/guides/consent
// Eksport tylko dla testu (analytics-scripts.spec.ts).
export const consentDefault = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  functionality_storage: 'denied',
  personalization_storage: 'denied',
  security_storage: 'granted',
  wait_for_update: 500
});
try {
  var m = document.cookie.match(/(?:^|; )cookies_consent=([^;]*)/);
  if (m) {
    var c = JSON.parse(decodeURIComponent(m[1]));
    if (c && c.v === 1) {
      gtag('consent', 'update', {
        analytics_storage: c.analytics ? 'granted' : 'denied',
        ad_storage: c.marketing ? 'granted' : 'denied',
        ad_user_data: c.marketing ? 'granted' : 'denied',
        ad_personalization: c.marketing ? 'granted' : 'denied',
        functionality_storage: c.functional ? 'granted' : 'denied',
        personalization_storage: c.functional ? 'granted' : 'denied',
        security_storage: 'granted'
      });
    }
  }
} catch (e) {}
`.trim();

/**
 * Consent Mode v2 defaults (server component) — tylko wpis w dataLayer, bez żądań sieciowych.
 *
 * Decyzja 22 (4.11.2026) — tryb PODSTAWOWY: GTM nie jest tu ładowany. Wstrzykuje go applyConsent()
 * → zaladujTagiGoogle() (lib/cookie-consent.ts) dopiero po zgodzie analitycznej albo marketingowej —
 * przy kliknięciu w banerze albo przy wejściu z zapisaną zgodą (CookieConsentManager przy montowaniu).
 * Zapisaną zgodę skrypt inline odtwarza od razu, więc kontener zastaje stan z banera.
 */
export function AnalyticsScripts({ nonce }: { nonce?: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document -- renderowane w root layoucie App Routera (app/layout.tsx), gdzie beforeInteractive jest wspierane; reguła zna tylko pages/_document */}
      <Script id="verris-consent-default" strategy="beforeInteractive" nonce={nonce}>
        {consentDefault}
      </Script>
    </>
  );
}
