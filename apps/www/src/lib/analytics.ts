// Warstwa pomiarowa Verris — spójny schemat zdarzeń dla całej verris.pl.
// GTM (GTM-PJQNXCF5) jest hubem: mapuje poniższe zdarzenia dataLayer na
// GA4 (G-HHN0S0R777), Google Ads (AW-9579432103) i Meta Pixel.
// Consent Mode v2 domyślnie „denied" — tagi odpalają się wyłącznie po zgodzie.

export const ANALYTICS = {
  gtmId: process.env.NEXT_PUBLIC_GTM_ID || '',
  ga4Id: process.env.NEXT_PUBLIC_GA4_ID || '',
  adsId: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || '',
  metaPixelId: process.env.NEXT_PUBLIC_META_PIXEL_ID || '',
};

type Params = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
  }
}

export function track(event: string, params: Params = {}): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

// Semantyczne zdarzenia lejka. Mapowanie w GTM:
//  cta_click       → GA4: cta_click (custom)
//  generate_lead   → GA4: generate_lead · Ads: Lead · Meta: Lead
//  begin_checkout  → GA4: begin_checkout · Ads: Begin checkout · Meta: InitiateCheckout
//  search          → GA4: search · Meta: Search
//  page_view       → GA4: page_view (SPA history change)
export const events = {
  ctaClick: (location: string, page: string) =>
    track('cta_click', { cta_location: location, page }),
  generateLead: (method: string) => track('generate_lead', { method, currency: 'PLN' }),
  beginCheckout: (plan: string, value?: number) =>
    track('begin_checkout', { plan, value, currency: 'PLN' }),
  search: (term: string) => track('search', { search_term: term }),
  pageView: (path: string) => track('page_view', { page_path: path }),
};

// Aktualizacja zgody po decyzji w banerze cookies.
export function updateConsent(granted: boolean): void {
  if (typeof window === 'undefined') return;
  const v = granted ? 'granted' : 'denied';
  window.gtag?.('consent', 'update', {
    ad_storage: v,
    ad_user_data: v,
    ad_personalization: v,
    analytics_storage: v,
  });
  if (granted) window.fbq?.('consent', 'grant');
  else window.fbq?.('consent', 'revoke');
}
