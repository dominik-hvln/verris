"use client";

/**
 * Zdarzenia konwersji GA4 — cienka warstwa nad window.dataLayer.
 *
 * Kontrakt z GTM/Consent Mode (analytics-scripts.tsx + cookie-consent.ts):
 *  - push do dataLayer jest zawsze bezpieczny — sam w sobie nie zapisuje
 *    cookies ani nie wysyła danych; dopiero tagi w GTM (gated Consent Mode v2)
 *    decydują, czy hit wyjdzie do Google. Dzięki temu nie musimy tu sprawdzać
 *    zgód — robi to warstwa tagów.
 *  - Nazwy zgodne z GA4 recommended events (sign_up, generate_lead,
 *    begin_checkout, purchase) — GA4 rozpozna je bez dodatkowej konfiguracji,
 *    a w Google Ads można je importować jako konwersje.
 *  - Przed każdym pushem e-commerce czyścimy poprzedni obiekt `ecommerce`
 *    (zalecenie Google — inaczej GTM merguje stare items z nowymi).
 *
 * Wartości: `value` podajemy w PLN brutto (Kredyty 1 K = 1 PLN), tylko gdy
 * kwotę znamy na pewno po stronie klienta. Powrót ze Stripe Checkout nie niesie
 * kwoty — patrz trackStripeCheckoutSuccess().
 */

export interface EcommerceItem {
  item_name: string;
  item_category?: "hosting" | "vps" | "domena" | "email" | "trial" | "kredyty";
  price?: number;
  quantity?: number;
}

function push(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

function pushEcommerce(
  event: string,
  ecommerce: Record<string, unknown>,
): void {
  push({ ecommerce: null }); // reset poprzedniego obiektu (merge-guard GTM)
  push({ event, ecommerce });
}

/** Konto utworzone (ekran „sprawdź skrzynkę" po rejestracji). */
export function trackSignUp(): void {
  push({ event: "sign_up", method: "email" });
}

/** Start okresu próbnego — lead, jeszcze nie przychód. */
export function trackGenerateLead(planName?: string): void {
  push({ event: "generate_lead", lead_type: "trial", plan_name: planName });
}

/** Wejście w formularz zamówienia (hosting/VPS/domena). */
export function trackBeginCheckout(items: EcommerceItem[], value?: number): void {
  pushEcommerce("begin_checkout", {
    currency: "PLN",
    ...(value != null && Number.isFinite(value) ? { value } : {}),
    items,
  });
}

/**
 * Zakup opłacony w panelu (Kredyty) — kwota znana na pewno.
 * transactionId: id subskrypcji/zamówienia (deduplikacja w GA4).
 */
export function trackPurchase(input: {
  transactionId: string;
  value: number;
  items: EcommerceItem[];
}): void {
  if (!Number.isFinite(input.value)) return;
  pushEcommerce("purchase", {
    transaction_id: input.transactionId,
    currency: "PLN",
    value: input.value,
    items: input.items,
  });
}

/**
 * Wyszukiwanie domen — najsilniejszy sygnał intencji zakupowej w panelu.
 * GA4 recommended event `search` z `search_term` (fraza widoczna w raportach).
 */
export function trackSearch(searchTerm: string): void {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return;
  push({ event: "search", search_term: term, search_type: "domain" });
}

/**
 * Powrót ze Stripe Checkout (?status=success na /dashboard/billing).
 * Kwoty nie znamy po stronie klienta, więc NIE wysyłamy `purchase` z wartością
 * (fałszywe zera psułyby ROAS). Event niestandardowy — można go oznaczyć jako
 * konwersję pomocniczą; docelowo pełny `purchase` powinien iść server-side
 * (GA4 Measurement Protocol z webhooka Stripe).
 */
export function trackStripeCheckoutSuccess(): void {
  push({ event: "stripe_checkout_success" });
}
