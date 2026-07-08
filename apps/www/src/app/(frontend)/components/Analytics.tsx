'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { ANALYTICS, events } from '@/lib/analytics';

// Consent Mode v2 — domyślnie wszystko „denied" (poza niezbędnym).
// Musi wykonać się PRZED załadowaniem GTM.
const consentDefault = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('consent','default',{
  ad_storage:'denied',
  ad_user_data:'denied',
  ad_personalization:'denied',
  analytics_storage:'denied',
  functionality_storage:'granted',
  security_storage:'granted',
  wait_for_update:500
});
gtag('set','ads_data_redaction',true);
gtag('set','url_passthrough',true);
`;

const gtmLoader = (id: string) => `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');
`;

// Meta Pixel NIE jest ładowany tutaj — bootstrap następuje leniwie w
// lib/cookie-consent.ts (applyConsent) dopiero po zgodzie marketingowej.

export function Analytics() {
  const pathname = usePathname();

  // page_view przy zmianie trasy (SPA).
  useEffect(() => {
    if (pathname) events.pageView(pathname);
  }, [pathname]);

  // Delegacja kliknięć: cta_click + zdarzenia konwersji (data-conv).
  useEffect(() => {
    const page = 'home';
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-event="cta_click"],[data-conv]');
      if (!el) return;
      if (el.dataset.cta) events.ctaClick(el.dataset.cta, page);
      const conv = el.dataset.conv;
      if (conv === 'begin_checkout') events.beginCheckout('hosting-autoscaling', 39);
      if (conv === 'generate_lead') events.generateLead(el.dataset.method || 'cta');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  if (!ANALYTICS.gtmId) return null;

  return (
    <>
      <Script id="consent-default" strategy="beforeInteractive">
        {consentDefault}
      </Script>
      <Script id="gtm" strategy="afterInteractive">
        {gtmLoader(ANALYTICS.gtmId)}
      </Script>
    </>
  );
}
