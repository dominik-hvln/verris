'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ANALYTICS, events } from '@/lib/analytics';
import { captureFbclid } from '@/lib/cookie-consent';

// Consent Mode v2 — domyślnie wszystko „denied" (poza niezbędnym). Tylko wpis w dataLayer, bez żądań sieciowych;
// GTM ładuje się dopiero po zgodzie (tryb podstawowy, decyzja 22) i zastaje ten stan.
// https://developers.google.com/tag-platform/security/guides/consent
//
// Każdy typ, który ustawia applyConsent(), ma tu wartość domyślną. `functionality_storage`
// i `personalization_storage` idą za kategorią „Funkcjonalne”, która w banerze jest opcjonalna
// i domyślnie wyłączona — do 29.09.2026 domyślnie było tu „granted” (a personalizacji brakowało),
// więc przed decyzją tagi z tymi wymogami działały bez zgody. Tak samo jak w panelu.
// Eksport tylko dla testu (Analytics.spec.ts).
export const consentDefault = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = window.gtag || gtag;
gtag('consent','default',{
  ad_storage:'denied',
  ad_user_data:'denied',
  ad_personalization:'denied',
  analytics_storage:'denied',
  functionality_storage:'denied',
  personalization_storage:'denied',
  security_storage:'granted',
  wait_for_update:500
});
// Powracający gość: zgoda z cookie odtworzona od razu (jak w panelu), więc kontener po załadowaniu
// (decyzja 22 – dopiero po zgodzie) zastaje stan z banera już przy inicjalizacji.
try{var m=document.cookie.match(/(?:^|; )cookies_consent=([^;]*)/);if(m){var c=JSON.parse(decodeURIComponent(m[1]));if(c&&c.v===1){gtag('consent','update',{
  analytics_storage:c.analytics?'granted':'denied',
  ad_storage:c.marketing?'granted':'denied',
  ad_user_data:c.marketing?'granted':'denied',
  ad_personalization:c.marketing?'granted':'denied',
  functionality_storage:c.functional?'granted':'denied',
  personalization_storage:c.functional?'granted':'denied',
  security_storage:'granted'
});}}}catch(e){}
gtag('set','ads_data_redaction',true);
`;

// Decyzja 22 (4.11.2026) — Consent Mode v2 w trybie podstawowym: GTM NIE jest ładowany tutaj. Wstrzykuje go
// applyConsent() → zaladujTagiGoogle() (lib/cookie-consent.ts) dopiero po zgodzie analitycznej albo marketingowej —
// przy kliknięciu w banerze albo przy wejściu z zapisaną zgodą (CookieConsent woła applyConsent przy montowaniu).
// Bez `<noscript>` z ramką GTM w layoucie: bez JavaScriptu nie ma jak wyrazić zgody, więc nic się nie ładuje.

// Meta Pixel też NIE jest ładowany tutaj — bootstrap następuje leniwie w
// lib/cookie-consent.ts (applyConsent) dopiero po zgodzie marketingowej.

const SCROLL_THRESHOLDS = [25, 50, 75, 90] as const;

/** `nonce` — z nagłówka `x-nonce` (layout); bez niego CSP strony zablokuje skrypt Consent Mode. */
export function Analytics({ nonce }: { nonce?: string }) {
  const pathname = usePathname();
  const firstRender = useRef(true);

  // Przechwyć fbclid z adresu wejścia (ruch z reklam Meta) ZANIM zniknie z URL przy
  // nawigacji SPA. Cookie `_fbc` powstanie dopiero po zgodzie marketingowej (applyConsent).
  useEffect(() => {
    captureFbclid();
  }, []);

  // page_view przy zmianie trasy (SPA).
  useEffect(() => {
    if (pathname) events.pageView(pathname);
  }, [pathname]);

  // Meta Pixel: PageView przy nawigacji SPA.
  //
  // `syncMetaPixel()` odpala PageView RAZ, przy bootstrapie Pixela po zgodzie.
  // Next.js nie przeładowuje dokumentu przy przejściu między podstronami, więc
  // bez tego Meta widziała jedną odsłonę na całą sesję — a strony docelowe kampanii
  // (np. /przenies-strone) w ogóle nie pojawiały się w statystykach.
  //
  // Pierwsze wywołanie pomijamy, żeby nie zdublować PageView z bootstrapu.
  // `window.fbq` istnieje wyłącznie po zgodzie marketingowej, więc bez zgody to no-op.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.fbq?.('track', 'PageView');
  }, [pathname]);

  // Delegacja kliknięć: cta_click + zdarzenia konwersji (data-conv).
  // `page` musi pochodzić z pathname — wcześniej było zahardkodowane 'home',
  // więc kliknięcia na /hosting czy /cennik raportowały się jako strona główna.
  useEffect(() => {
    const page = pathname || '/';
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement)?.closest<HTMLElement>('[data-event="cta_click"],[data-conv]');
      if (!el) return;
      if (el.dataset.cta) events.ctaClick(el.dataset.cta, page);

      // Wyłącznie `checkout_intent`. Kliknięcie w link NIE jest ani rozpoczęciem
      // checkoutu, ani leadem — jedno i drugie zdarza się dopiero w panelu / po
      // wysłaniu formularza. Wcześniej `data-conv="checkout_intent"` wisiał m.in.
      // na przycisku w nagłówku, obecnym na każdej podstronie.
      if (el.dataset.conv === 'checkout_intent') {
        events.checkoutIntent(el.dataset.plan || 'hosting', page);
      }
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [pathname]);

  // form_start — pierwszy focus w formularzu, raz na formularz na odsłonę.
  // Różnica (form_start − generate_lead) to porzucenia formularza.
  useEffect(() => {
    const page = pathname || '/';
    const started = new Set<string>();
    const onFocusIn = (e: FocusEvent) => {
      const field = e.target as HTMLElement | null;
      if (!field || !field.matches('input, textarea, select')) return;
      const form = field.closest('form');
      if (!form) return;
      const formId = form.id || form.dataset.formId || 'form';
      if (started.has(formId)) return;
      started.add(formId);
      events.formStart(formId, page);
    };
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [pathname]);

  // scroll_depth 25/50/75/90 — enhanced measurement GA4 daje wyłącznie 90%.
  // Każdy próg raportujemy raz na odsłonę; licznik zeruje się przy zmianie trasy.
  useEffect(() => {
    const page = pathname || '/';
    const fired = new Set<number>();
    let ticking = false;

    const measure = () => {
      ticking = false;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      // Strona krótsza niż okno — nie ma czego mierzyć, każdy próg byłby fałszywy.
      if (scrollable <= 0) return;
      const pct = ((window.scrollY || doc.scrollTop) / scrollable) * 100;
      for (const t of SCROLL_THRESHOLDS) {
        if (pct >= t && !fired.has(t)) {
          fired.add(t);
          events.scrollDepth(t, page);
        }
      }
      if (fired.size === SCROLL_THRESHOLDS.length) {
        window.removeEventListener('scroll', onScroll);
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(measure);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    measure(); // strona może wczytać się już przewinięta (kotwica, przywrócenie pozycji)
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  if (!ANALYTICS.gtmId) return null;

  return (
    <Script id="consent-default" strategy="beforeInteractive" nonce={nonce}>
      {consentDefault}
    </Script>
  );
}
