/**
 * Klient API partnera sadzenia drzew (posadzimy.pl) — wyłącznie wg dokumentacji producenta:
 * - opis produkcyjny: https://posadzimy.pl/automatyzacje/api-wersja-produkcyjna/
 * - opis testowy (RC, darmowe kredyty): https://posadzimy.pl/automatyzacje/api-wersja-testowa/
 * - Swagger 1.0.1: https://rc.api.posadzimy.pl/api/doc/ (produkcja: https://api.posadzimy.pl/api/doc/)
 *
 * Uwierzytelnianie: nagłówek `X-AUTH-TOKEN: {apiToken}`. Używamy dwóch metod:
 * - POST /api/integration/check_credit_balance, body {} → 200 {status, data:{creditsBalance}}
 * - POST /api/integration/make_order, body {customerName, treeGroupID, numberOfTrees, certificateText}
 *   → 201 {status, data:{orderId, certificateUrl, certificateImageUrl, treeGroupName, plantActionName}}; 401; 422.
 *
 * API nie ma klucza idempotencji, więc wynik zamówienia dzielimy na trzy rodzaje:
 * - `przyjete` — jest orderId (zapisujemy go i nigdy nie wysyłamy tego zamówienia ponownie),
 * - `odrzucone` — na pewno nic nie złożono (4xx albo brak połączenia przed wysłaniem) → można ponowić,
 * - `niepewne` — nie wiadomo (przekroczony czas, 5xx, zerwane połączenie, dziwna odpowiedź) → NIE ponawiamy sami,
 *   bo drugie wysłanie mogłoby posadzić (i obciążyć kredytami) drugi raz; sprawdza admin w panelu partnera.
 * Bez „zapasowych” wywołań: błąd API jest błędem, nie sukcesem.
 */

export const ADRESY_POSADZIMY = {
  produkcja: 'https://api.posadzimy.pl',
  test: 'https://rc.api.posadzimy.pl',
} as const;

export type ZamowienieDrzew = {
  customerName: string;
  treeGroupID: string;
  numberOfTrees: number;
  certificateText?: string;
};

export type WynikZamowienia =
  | { rodzaj: 'przyjete'; orderId: number; certificateUrl: string | null; certificateImageUrl: string | null }
  | { rodzaj: 'odrzucone'; blad: string }
  | { rodzaj: 'niepewne'; blad: string };

export class PosadzimyBlad extends Error {}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Kody błędów sieci zgłaszane, zanim żądanie wyszło (połączenie nie powstało albo TLS nie przeszedł). */
const PRZED_WYSLANIEM = /^(ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ERR_TLS_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_)/;

function kodBledu(e: unknown): string {
  const przyczyna = (e as { cause?: { code?: unknown } })?.cause;
  const kod = przyczyna?.code ?? (e as { code?: unknown })?.code;
  return typeof kod === 'string' ? kod : '';
}

function komunikat(body: unknown, status: number): string {
  const m = (body as { message?: unknown } | null)?.message;
  return typeof m === 'string' && m.trim() ? `HTTP ${status}: ${m.trim().slice(0, 300)}` : `HTTP ${status}`;
}

const tekstUrl = (v: unknown): string | null => (typeof v === 'string' && /^https?:\/\//.test(v) ? v : null);

export class PosadzimyClient {
  private readonly fetchFn: Fetch;
  private readonly timeoutMs: number;

  constructor(
    private readonly opts: { baseUrl: string; token: string; fetch?: Fetch; timeoutMs?: number },
  ) {
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  private zadanie(sciezka: string, body: unknown): Promise<Response> {
    return this.fetchFn(`${this.opts.baseUrl.replace(/\/$/, '')}${sciezka}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-AUTH-TOKEN': this.opts.token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: 'error',
    });
  }

  /** Saldo kredytów API. Każdy błąd = wyjątek (nie sadzimy „na ślepo”). */
  async saldo(): Promise<number> {
    let res: Response;
    try {
      res = await this.zadanie('/api/integration/check_credit_balance', {});
    } catch (e) {
      throw new PosadzimyBlad(`Brak połączenia z API sadzenia (${kodBledu(e) || (e as Error).name}).`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new PosadzimyBlad(`Saldo kredytów: ${komunikat(body, res.status)}`);
    const saldo = (body as { data?: { creditsBalance?: unknown } } | null)?.data?.creditsBalance;
    if (typeof saldo !== 'number' || !Number.isInteger(saldo) || saldo < 0) {
      throw new PosadzimyBlad('Saldo kredytów: odpowiedź bez creditsBalance.');
    }
    return saldo;
  }

  async zamow(z: ZamowienieDrzew): Promise<WynikZamowienia> {
    let res: Response;
    try {
      res = await this.zadanie('/api/integration/make_order', {
        customerName: z.customerName,
        treeGroupID: z.treeGroupID,
        numberOfTrees: z.numberOfTrees,
        ...(z.certificateText ? { certificateText: z.certificateText } : {}),
      });
    } catch (e) {
      const kod = kodBledu(e);
      if (PRZED_WYSLANIEM.test(kod)) return { rodzaj: 'odrzucone', blad: `Brak połączenia z API sadzenia (${kod}).` };
      return {
        rodzaj: 'niepewne',
        blad: `Brak odpowiedzi API sadzenia (${kod || (e as Error).name}) — sprawdź w panelu partnera, czy zamówienie powstało.`,
      };
    }
    const body = await res.json().catch(() => null);
    if (res.ok) {
      const d = (body as { data?: Record<string, unknown> } | null)?.data;
      const orderId = d?.orderId;
      if (typeof orderId === 'number' && Number.isSafeInteger(orderId) && orderId > 0) {
        return {
          rodzaj: 'przyjete',
          orderId,
          certificateUrl: tekstUrl(d?.certificateUrl),
          certificateImageUrl: tekstUrl(d?.certificateImageUrl),
        };
      }
      return { rodzaj: 'niepewne', blad: `HTTP ${res.status} bez orderId — sprawdź w panelu partnera.` };
    }
    // 408 (przekroczony czas po stronie serwera) i 5xx: serwer mógł zamówienie przyjąć.
    if (res.status === 408 || res.status >= 500) {
      return { rodzaj: 'niepewne', blad: `${komunikat(body, res.status)} — sprawdź w panelu partnera.` };
    }
    return { rodzaj: 'odrzucone', blad: komunikat(body, res.status) };
  }
}
