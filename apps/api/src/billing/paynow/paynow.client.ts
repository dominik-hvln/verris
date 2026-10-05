import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

/**
 * Klient Paynow (mBank) API v3 na `fetch` — bez paczek zewnętrznych, jak `StripeClient`.
 *
 * Źródła (oficjalna dokumentacja Paynow):
 *  - nagłówki, środowiska, podpis, powiadomienia: https://docs.paynow.pl/docs/v3/integration
 *  - płatność i statusy:                          https://docs.paynow.pl/docs/v3/payments
 *  - POST /v3/payments:                           https://docs.paynow.pl/docs/reference/v3/send-payment-request
 *  - GET /v3/payments/{paymentId}/status:         https://docs.paynow.pl/docs/reference/v3/get-payment-status
 *  - POST /v3/payments/{paymentId}/refunds:       https://docs.paynow.pl/docs/reference/v3/send-refund-request
 *  - zwroty (statusy, saldo, „raz dziennie”):     https://docs.paynow.pl/docs/v3/refunds
 *  - wzorcowa implementacja podpisu v3 (oficjalne SDK Paynow):
 *    https://github.com/pay-now/paynow-php-sdk/blob/master/src/Paynow/Util/SignatureCalculator.php
 */

export const PAYNOW_SANDBOX_URL = 'https://api.sandbox.paynow.pl';
export const PAYNOW_PRODUKCJA_URL = 'https://api.paynow.pl';

export const STATUSY_PLATNOSCI_PAYNOW = ['NEW', 'PENDING', 'CONFIRMED', 'REJECTED', 'ERROR', 'EXPIRED', 'ABANDONED'] as const;
export type StatusPlatnosciPaynow = (typeof STATUSY_PLATNOSCI_PAYNOW)[number];

export function czyStatusPaynow(s: unknown): s is StatusPlatnosciPaynow {
  return typeof s === 'string' && (STATUSY_PLATNOSCI_PAYNOW as readonly string[]).includes(s);
}

/** Format `paymentId` z API reference (np. NOLV-8F9-08K-WGD) — sprawdzany, zanim trafi do ścieżki URL. */
export const PAYMENT_ID_RE = /^[a-zA-Z0-9]{4}(-[a-zA-Z0-9]{3}){3}$/;

/**
 * JSON, w którym znaki spoza ASCII są zapisane jako `\uXXXX`.
 *
 * Podpis v3 liczy się z treści żądania osadzonej jako napis w JSON-ie. Oficjalne SDK robi to
 * `json_encode(..., JSON_UNESCAPED_SLASHES)` — PHP zamienia przy tym polskie znaki na `ł`,
 * a `JSON.stringify` zostawia je dosłownie, więc podpis różniłby się dla opisu „Doładowanie”.
 * Wysyłając treść już w postaci ASCII, oba zapisy są bajt w bajt identyczne (treść JSON-a ta sama).
 */
export function jsonAscii(v: unknown): string {
  return JSON.stringify(v).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * Podpis żądania v3: HMAC-SHA256 (klucz = Signature-Key) z JSON-a
 * `{"headers":{"Api-Key":…,"Idempotency-Key":…},"parameters":{…},"body":"<treść>"}`, Base64.
 * Kolejność pól jak w dokumentacji, nagłówki alfabetycznie, bez spacji (jak `json_encode` w SDK).
 */
export function podpisZadania(i: {
  apiKey: string;
  signatureKey: string;
  idempotencyKey: string;
  body: string;
  parameters?: Record<string, string[]>;
}): string {
  const dane = JSON.stringify({
    headers: { 'Api-Key': i.apiKey, 'Idempotency-Key': i.idempotencyKey },
    parameters: i.parameters ?? {},
    body: i.body,
  });
  return createHmac('sha256', i.signatureKey).update(dane).digest('base64');
}

/** Podpis powiadomienia: HMAC-SHA256 z surowej treści żądania, Base64 (nagłówek `Signature`). */
export function podpisPowiadomienia(signatureKey: string, surowaTresc: Buffer | string): string {
  return createHmac('sha256', signatureKey).update(surowaTresc).digest('base64');
}

/** Porównanie w czasie stałym — „DO NOT PROCESS that message if the calculated signature doesn't correspond”. */
export function poprawnyPodpisPowiadomienia(signatureKey: string, surowaTresc: Buffer, naglowek: string | undefined): boolean {
  if (!naglowek) return false;
  const oczekiwany = Buffer.from(podpisPowiadomienia(signatureKey, surowaTresc));
  const otrzymany = Buffer.from(naglowek.trim());
  return oczekiwany.length === otrzymany.length && timingSafeEqual(oczekiwany, otrzymany);
}

export class PaynowBlad extends Error {
  constructor(
    readonly httpStatus: number,
    readonly typyBledow: string[],
  ) {
    super(`Paynow HTTP ${httpStatus}${typyBledow.length ? ` (${typyBledow.join(', ')})` : ''}`);
  }
}

export interface ZlecenieWplatyPaynow {
  /** Grosze, 100..100000000 wg API reference. */
  amount: number;
  currency: 'PLN';
  externalId: string;
  description: string;
  continueUrl: string;
  buyer: { email: string };
}

export class PaynowClient {
  constructor(
    private readonly apiKey: string,
    private readonly signatureKey: string,
    private readonly baseUrl: string,
  ) {}

  utworzPlatnosc(z: ZlecenieWplatyPaynow, idempotencyKey: string) {
    return this.zadanie<{ redirectUrl?: string; paymentId: string; status?: StatusPlatnosciPaynow }>(
      'POST',
      '/v3/payments',
      idempotencyKey,
      z,
    );
  }

  statusPlatnosci(paymentId: string) {
    if (!PAYMENT_ID_RE.test(paymentId)) throw new Error(`Niepoprawny paymentId Paynow: ${paymentId}`);
    // GET też wymaga Idempotency-Key i podpisu (treść pusta) — nowy klucz przy każdym odczycie.
    return this.zadanie<{ paymentId: string; status: StatusPlatnosciPaynow }>(
      'GET',
      `/v3/payments/${paymentId}/status`,
      randomUUID(),
    );
  }

  zwrot(paymentId: string, z: { amount: number; reason: 'RMA' | 'REFUND_BEFORE_14' | 'REFUND_AFTER_14' | 'OTHER' }, idempotencyKey: string) {
    if (!PAYMENT_ID_RE.test(paymentId)) throw new Error(`Niepoprawny paymentId Paynow: ${paymentId}`);
    return this.zadanie<{ refundId: string; status: string }>('POST', `/v3/payments/${paymentId}/refunds`, idempotencyKey, z);
  }

  private async zadanie<T>(metoda: 'GET' | 'POST', sciezka: string, idempotencyKey: string, tresc?: unknown): Promise<T> {
    const body = tresc === undefined ? '' : jsonAscii(tresc);
    const headers: Record<string, string> = {
      'Api-Key': this.apiKey,
      'Idempotency-Key': idempotencyKey,
      Signature: podpisZadania({ apiKey: this.apiKey, signatureKey: this.signatureKey, idempotencyKey, body }),
      Accept: 'application/json',
    };
    if (metoda === 'POST') headers['Content-Type'] = 'application/json';
    const res = await fetch(`${this.baseUrl}${sciezka}`, {
      method: metoda,
      headers,
      body: metoda === 'POST' ? body : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    let dane: unknown;
    try {
      dane = await res.json();
    } catch {
      dane = undefined;
    }
    if (!res.ok) {
      // Odpowiedź błędu: { statusCode, errors: [{ errorType, message }] } — do logu idą tylko typy.
      const bledy = (dane as { errors?: Array<{ errorType?: string }> } | undefined)?.errors ?? [];
      throw new PaynowBlad(res.status, bledy.map((b) => b.errorType ?? '?'));
    }
    return dane as T;
  }
}
