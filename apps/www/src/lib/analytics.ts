// Warstwa pomiarowa Verris — spójny schemat zdarzeń dla całej verris.pl.
// GTM (GTM-PJQNXCF5) jest hubem: mapuje poniższe zdarzenia dataLayer na
// GA4 (G-HHN0S0R777), Google Ads (AW-9579432103) i Meta Pixel.
// Consent Mode v2 domyślnie „denied" — tagi odpalają się wyłącznie po zgodzie.
//
// Zgodę aktualizuje WYŁĄCZNIE `applyConsent()` z lib/cookie-consent.ts, granularnie
// (analytics ≠ marketing). Nie dodawaj tutaj skrótu typu `updateConsent(boolean)` —
// sklejenie kategorii nadaje zgodę marketingową komuś, kto zaznaczył samą analitykę.

export const ANALYTICS = {
  gtmId: process.env.NEXT_PUBLIC_GTM_ID || '',
  ga4Id: process.env.NEXT_PUBLIC_GA4_ID || '',
  adsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || '',
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || '',
};

/**
 * Umowna wartość leada (PLN, brutto) — roczna cena pakietu.
 *
 * Potrzebna, bo GA4 wymaga `value` i `currency`, żeby `generate_lead` kwalifikowało się
 * jako key event i zaimportowało do Google Ads jako konwersja. Wartość jest UMOWNA i służy
 * wyłącznie kalibracji Smart Biddingu — nie jest przychodem i nie trafia do księgowości.
 * Gdy poznamy realny współczynnik lead → klient, podmień na `349 × współczynnik`.
 */
export const LEAD_VALUE_PLN = 349;

type Params = Record<string, unknown>;

declare global {
  // Deklaracja MUSI być identyczna z lib/cookie-consent.ts — inaczej TS zgłasza
  // „All declarations of 'dataLayer'/'fbq' must have identical modifiers".
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
    _fbq?: unknown;
  }
}

/**
 * Identyfikator zdarzenia do deduplikacji Meta Pixel ↔ Conversions API.
 *
 * Pixel (przeglądarka) i CAPI (serwer) wysyłają to samo zdarzenie. Meta scala je w jedno
 * TYLKO wtedy, gdy oba mają identyczne `event_id` i `event_name`. Bez tego każdy zakup
 * liczy się dwa razy — ROAS wygląda dwukrotnie lepiej, niż jest, a Smart Bidding dostaje
 * zafałszowany sygnał.
 *
 * `crypto.randomUUID()` jest dostępne we wszystkich przeglądarkach wspieranych przez §3
 * regulaminu; fallback dla starszych i dla kontekstów bez secure origin.
 */
export function newEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function track(event: string, params: Params = {}): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

/**
 * Zdarzenia wysyłane do Meta muszą nieść `event_id`. Tagi Pixela w GTM czytają je
 * ze zmiennej dataLayer i przekazują jako `eventID`; ta sama wartość musi trafić
 * do CAPI po stronie serwera.
 */
function trackWithEventId(event: string, params: Params = {}): string {
  const eventId = newEventId();
  track(event, { ...params, event_id: eventId });
  return eventId;
}

// Semantyczne zdarzenia lejka. Mapowanie w GTM:
//  cta_click       → GA4: cta_click (custom)
//  checkout_intent → GA4: checkout_intent (custom, NIE key event) — klik w CTA prowadzące do panelu
//  generate_lead   → GA4: generate_lead · Ads: Lead · Meta: Lead        [event_id]
//  search          → GA4: search · Meta: Search
//  page_view       → GA4: page_view (SPA history change)
//  scroll_depth    → GA4: scroll_depth (custom, progi 25/50/75/90)
//  form_start      → GA4: form_start (custom) — pierwszy focus, mierzy porzucenia
//
// UWAGA — `begin_checkout` NIE JEST i nie może być wysyłane z verris.pl.
// Strona marketingowa nie rozpoczyna checkoutu; ona tylko linkuje do panelu.
// Prawdziwy `begin_checkout` odpala panel, gdy użytkownik wejdzie w formularz zamówienia
// (apps/client-panel/src/lib/analytics-events.ts). Wysyłanie go z obu miejsc dawało
// podwójne zliczanie: GA4 liczył dwa begin_checkout, a Meta dwa InitiateCheckout
// z różnymi `event_id`, więc deduplikacja nie miała szans zadziałać.
export const events = {
  ctaClick: (location: string, page: string) =>
    track('cta_click', { cta_location: location, page }),

  /**
   * Klik w przycisk prowadzący do panelu. To sygnał intencji, nie konwersja.
   * Nie oznaczaj go jako key event i nie bidowuj po nim — inaczej zapłacisz
   * za kliknięcia w nawigację.
   */
  checkoutIntent: (plan: string, page: string) =>
    track('checkout_intent', { plan, page }),

  /**
   * WYŁĄCZNIE po realnym wysłaniu formularza. Nigdy z klika w link.
   * Zwraca `event_id` — przekaż go do CAPI, jeśli lead trafia też na serwer.
   */
  generateLead: (method: string, value: number = LEAD_VALUE_PLN) =>
    trackWithEventId('generate_lead', { method, value, currency: 'PLN' }),

  search: (term: string) => track('search', { search_term: term }),
  pageView: (path: string) => track('page_view', { page_path: path }),

  /** Próg przekroczony po raz pierwszy w danej odsłonie. */
  scrollDepth: (threshold: 25 | 50 | 75 | 90, page: string) =>
    track('scroll_depth', { scroll_depth: threshold, page }),

  /** Pierwszy focus w dowolnym polu formularza — jeden raz na formularz. */
  formStart: (formId: string, page: string) => track('form_start', { form_id: formId, page }),
};
