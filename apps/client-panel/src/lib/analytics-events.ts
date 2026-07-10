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

/** Umowna wartość leada (PLN brutto) — GA4 wymaga `value` + `currency` dla key eventu. */
export const LEAD_VALUE_PLN = 349;

function push(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

/**
 * Identyfikator zdarzenia do deduplikacji Meta Pixel ↔ Conversions API.
 *
 * Pixel (przeglądarka) i CAPI (serwer) wysyłają to samo zdarzenie. Meta scali je
 * w jedno TYLKO gdy oba mają identyczne `event_id` i `event_name`. Bez tego każdy
 * zakup liczy się dwukrotnie: ROAS wygląda dwa razy lepiej, niż jest naprawdę,
 * a Smart Bidding optymalizuje pod zafałszowany sygnał.
 *
 * Ta sama wartość musi trafić do webhooka Stripe → CAPI (`event_id` w payloadzie).
 */
export function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Meta Pixel — standardowe zdarzenia równolegle do GA4.
 * `window.fbq` istnieje WYŁĄCZNIE po zgodzie marketingowej (lazy-load w
 * cookie-consent.ts), więc bez zgody wywołanie jest no-opem — zgodność
 * z Consent Mode bez dodatkowych warunków tutaj.
 *
 * `eventID` przekazujemy zawsze, gdy zdarzenie ma odpowiednik po stronie serwera.
 */
function fbqTrack(
  event: string,
  params?: Record<string, unknown>,
  eventId?: string,
): void {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (eventId) window.fbq("track", event, params, { eventID: eventId });
  else window.fbq("track", event, params);
}

function pushEcommerce(
  event: string,
  ecommerce: Record<string, unknown>,
  eventId?: string,
): void {
  push({ ecommerce: null }); // reset poprzedniego obiektu (merge-guard GTM)
  push({ event, ecommerce, ...(eventId ? { event_id: eventId } : {}) });
}

/** Konto utworzone (ekran „sprawdź skrzynkę" po rejestracji). */
export function trackSignUp(): void {
  const eventId = newEventId();
  push({ event: "sign_up", method: "email", event_id: eventId });
  fbqTrack("CompleteRegistration", undefined, eventId);
}

/**
 * Start okresu próbnego — lead, jeszcze nie przychód.
 * `value` + `currency` są wymagane, by GA4 uznał `generate_lead` za key event
 * i by dało się je zaimportować do Google Ads. Wartość jest UMOWNA (nie przychód).
 */
export function trackGenerateLead(planName?: string): void {
  const eventId = newEventId();
  push({
    event: "generate_lead",
    lead_type: "trial",
    plan_name: planName,
    value: LEAD_VALUE_PLN,
    currency: "PLN",
    event_id: eventId,
  });
  fbqTrack(
    "Lead",
    { value: LEAD_VALUE_PLN, currency: "PLN", ...(planName ? { content_name: planName } : {}) },
    eventId,
  );
}

/** Wejście w formularz zamówienia (hosting/VPS/domena). */
export function trackBeginCheckout(items: EcommerceItem[], value?: number): void {
  const eventId = newEventId();
  pushEcommerce("begin_checkout", {
    currency: "PLN",
    ...(value != null && Number.isFinite(value) ? { value } : {}),
    items,
  }, eventId);
  fbqTrack(
    "InitiateCheckout",
    {
      content_name: items[0]?.item_name,
      content_category: items[0]?.item_category,
      ...(value != null && Number.isFinite(value) ? { value, currency: "PLN" } : {}),
    },
    eventId,
  );
}

/**
 * Zakup opłacony w panelu (Kredyty) — kwota znana na pewno.
 * transactionId: id subskrypcji/zamówienia (deduplikacja w GA4).
 *
 * Zwraca `event_id` — przekaż go do webhooka Stripe, żeby CAPI wysłało Purchase
 * z tym samym identyfikatorem. Bez tego Meta policzy zakup dwa razy.
 */
export function trackPurchase(input: {
  transactionId: string;
  value: number;
  items: EcommerceItem[];
}): string | undefined {
  if (!Number.isFinite(input.value)) return undefined;
  // Deterministycznie z transactionId: gdyby użytkownik odświeżył stronę potwierdzenia,
  // Pixel wyśle to samo event_id, a Meta zdeduplikuje zdarzenie samo z siebie.
  const eventId = `purchase-${input.transactionId}`;
  pushEcommerce("purchase", {
    transaction_id: input.transactionId,
    currency: "PLN",
    value: input.value,
    items: input.items,
  }, eventId);
  fbqTrack(
    "Purchase",
    {
      value: input.value,
      currency: "PLN",
      content_name: input.items[0]?.item_name,
      content_category: input.items[0]?.item_category,
    },
    eventId,
  );

  // Conversions API (server-side) — z tym samym event_id do deduplikacji.
  // Odzyskuje zakupy blokowane przez adblocki. WYŁĄCZNIE po zgodzie marketingowej.
  void relayPurchaseIfConsented(eventId, input.value, input.items[0]?.item_name);

  return eventId;
}

/**
 * Uruchamia server-side relay do Meta CAPI, jeśli użytkownik ma zgodę marketingową.
 * Import dynamiczny, żeby nie ciągnąć server action do bundla, gdy nie jest potrzebny.
 */
async function relayPurchaseIfConsented(
  eventId: string,
  value: number,
  contentName?: string,
): Promise<void> {
  try {
    const { readConsent } = await import("./cookie-consent");
    if (!readConsent()?.marketing) return;
    const { relayPurchaseToCapi } = await import("./meta-capi");
    await relayPurchaseToCapi({
      eventId,
      value,
      currency: "PLN",
      contentName,
      eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
    });
  } catch {
    /* best-effort */
  }
}

/**
 * Wyszukiwanie domen — najsilniejszy sygnał intencji zakupowej w panelu.
 * GA4 recommended event `search` z `search_term` (fraza widoczna w raportach).
 */
export function trackSearch(searchTerm: string): void {
  const term = searchTerm.trim().toLowerCase();
  if (!term) return;
  push({ event: "search", search_term: term, search_type: "domain" });
  fbqTrack("Search", { search_string: term });
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

// ---------------------------------------------------------------------------
// Enhanced Conversions (Google Ads) + Advanced Matching (Meta)
// ---------------------------------------------------------------------------

/**
 * SHA-256 z e-maila, hex lowercase — format wymagany przez Google i Meta.
 *
 * Normalizacja PRZED haszowaniem jest obowiązkowa i częsta do przeoczenia:
 * trim + lowercase. Bez niej `Jan@Firma.PL` i `jan@firma.pl` dają różne hashe,
 * match rate leci w dół, a Enhanced Conversions cicho przestaje działać.
 *
 * `crypto.subtle` istnieje wyłącznie w secure context (https / localhost).
 */
async function sha256Hex(value: string): Promise<string | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Wypycha zahaszowany e-mail do dataLayer jako `user_data.sha256_email_address`.
 *
 * ZASADY, KTÓRYCH NIE WOLNO ZŁAMAĆ:
 *  - wyłącznie po zgodzie MARKETINGOWEJ (`consent.marketing === true`);
 *    zgoda na analitykę NIE wystarcza — to dane przekazywane reklamodawcom;
 *  - wyłącznie zahaszowane; surowy e-mail nigdy nie trafia do dataLayer;
 *  - wywołuj PRZED zdarzeniem konwersji, żeby tag zdążył odczytać `user_data`.
 *
 * Podnosi match rate w Google Ads i EMQ w Meta, czyli realnie obniża koszt konwersji.
 * Wymaga wzmianki w polityce prywatności i na liście podprocesorów (Google, Meta).
 */
export async function pushUserData(email: string): Promise<void> {
  if (typeof window === "undefined") return;

  // Import dynamiczny — cookie-consent jest modułem klienckim z efektami ubocznymi.
  const { readConsent } = await import("./cookie-consent");
  const consent = readConsent();
  if (!consent?.marketing) return;

  const hashed = await sha256Hex(email);
  if (!hashed) return;

  push({ user_data: { sha256_email_address: hashed } });
}

/**
 * Czyści `user_data` z dataLayer — wołaj przy wylogowaniu i przy wycofaniu zgody
 * marketingowej. Bez tego hash zostaje w pamięci strony do przeładowania.
 */
export function clearUserData(): void {
  push({ user_data: null });
}
