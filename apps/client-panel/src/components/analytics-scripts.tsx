import Script from "next/script";

/**
 * Consent Mode v2 defaults + optional GTM bootstrap (server component).
 *
 * Order matters: the consent-default script MUST run before GTM so every
 * tag starts in the `denied` state (EEA requirement, Consent Mode v2).
 * If a valid `cookies_consent` cookie already exists, the same inline
 * script replays it synchronously so returning visitors don't lose
 * granted state between page loads.
 *
 * GTM loads only when NEXT_PUBLIC_GTM_ID is set — without it this
 * component renders the consent defaults only (no external requests).
 */
export function AnalyticsScripts() {
  const gtmId = process.env.NEXT_PUBLIC_GTM_ID;

  const consentDefault = `
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

  return (
    <>
      <Script id="verris-consent-default" strategy="beforeInteractive">
        {consentDefault}
      </Script>
      {gtmId ? (
        <Script id="verris-gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');`}
        </Script>
      ) : null}
    </>
  );
}
