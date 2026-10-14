/**
 * 14.10 — `purchase` do GA4 z serwera (Measurement Protocol) dla zakupu kartą.
 *
 * Przy płatności kartą klient płaci na stronie faktury Stripe i nie wraca do panelu, więc zdarzenia nie wyśle
 * przeglądarka (zakup Paynow wysyła strona powrotu — ZakupPoPowrocie). Wysyłamy je po potwierdzeniu płatności,
 * z identyfikatorem klienta GA4 (`client_id` z ciasteczka `_ga`), który panel przekazuje przy zamówieniu tylko przy
 * zgodzie na analitykę. `transaction_id` = ID usługi, jak w panelu — GA4 deduplikuje zakupy po tym polu.
 *
 * Dokumentacja Google: https://developers.google.com/analytics/devguides/collection/protocol/ga4/sending-events
 * (endpoint /mp/collect, measurement_id + api_secret w adresie, client_id i events w treści) oraz
 * https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events#purchase
 *
 * Bez konfiguracji (puste GA4_MEASUREMENT_ID lub GA4_API_SECRET) nic nie wysyła. Nigdy nie rzuca — pomiar nie może
 * zatrzymać aktywacji usługi.
 */
export interface KonfiguracjaGa4 {
  measurementId: string;
  apiSecret: string;
}

export interface ZakupDoGa4 {
  clientId: string;
  transactionId: string;
  /** Kwota brutto zapłacona przez klienta. */
  value: number;
  currency: string;
  itemName: string;
  itemCategory: string;
}

const MP_URL = 'https://www.google-analytics.com/mp/collect';

export async function wyslijZakupDoGa4(
  cfg: KonfiguracjaGa4,
  z: ZakupDoGa4,
  fetchImpl: typeof fetch = fetch,
): Promise<'wyslano' | 'brak-konfiguracji' | 'blad'> {
  const measurementId = cfg.measurementId.trim();
  const apiSecret = cfg.apiSecret.trim();
  if (!measurementId || !apiSecret) return 'brak-konfiguracji';
  if (!/^\d{1,20}\.\d{1,20}$/.test(z.clientId) || !Number.isFinite(z.value)) return 'blad';
  const url = `${MP_URL}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  const body = {
    client_id: z.clientId,
    events: [
      {
        name: 'purchase',
        params: {
          transaction_id: z.transactionId,
          value: Math.round(z.value * 100) / 100,
          currency: z.currency,
          // Zdarzenie z serwera nie ma czasu zaangażowania; bez niego GA4 nie łączy go z aktywną sesją w raportach.
          engagement_time_msec: 1,
          items: [{ item_id: z.transactionId, item_name: z.itemName, item_category: z.itemCategory, price: Math.round(z.value * 100) / 100, quantity: 1 }],
        },
      },
    ],
  };
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    // MP zawsze odpowiada 2xx (także przy błędnych danych) — poprawność sprawdza się endpointem /debug/mp/collect.
    return res.ok ? 'wyslano' : 'blad';
  } catch {
    return 'blad';
  }
}
