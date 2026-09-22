/**
 * Szybka odmowa dla węzła, który przed chwilą nie odpowiadał.
 *
 * Bez tego każdy widok panelu dla martwego węzła czekał po 15 s na każde
 * zapytanie (lista domen, poczta, kopie, SSL…) — strona usługi ładowała się
 * minutę, a klient widział tylko kręcące się kółka. Z bezpiecznikiem pierwsze
 * zapytanie trafia w błąd sieci, kolejne przez chwilę odpadają od razu.
 *
 * Ostrożnie z timeoutami: pojedyncza długa komenda (np. backup) może trwać
 * dłużej niż limit, a węzeł żyje. Dlatego timeout otwiera bezpiecznik dopiero
 * przy DRUGIM z rzędu w oknie; błędy połączenia (odmowa, brak DNS, brak trasy)
 * — od razu. Udane zapytanie zeruje licznik.
 *
 * ponytail: stan w pamięci procesu (per instancja API); przy wielu replikach
 * każda uczy się sama — wystarczy, bo okno jest krótkie.
 */
export const NODE_DOWN_MS = 30_000;

const CONNECT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH']);
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ECONNABORTED']);

const downUntil = new Map<string, number>();
const lastTimeout = new Map<string, number>();

type NetErr = { code?: string; response?: unknown } | null | undefined;

/** Rodzaj błędu z punktu widzenia bezpiecznika (odpowiedź HTTP z węzła = węzeł żyje). */
export function nodeErrorKind(err: unknown): 'connect' | 'timeout' | null {
  const e = err as NetErr;
  if (!e || e.response || !e.code) return null;
  if (CONNECT_CODES.has(e.code)) return 'connect';
  if (TIMEOUT_CODES.has(e.code)) return 'timeout';
  return null;
}

/** Zapisz porażkę; zwraca true, gdy bezpiecznik się otworzył. */
export function recordNodeFailure(key: string, err: unknown, now = Date.now()): boolean {
  const kind = nodeErrorKind(err);
  if (!kind) return false;
  if (kind === 'timeout') {
    const prev = lastTimeout.get(key);
    lastTimeout.set(key, now);
    if (prev == null || now - prev > NODE_DOWN_MS) return false;
  }
  downUntil.set(key, now + NODE_DOWN_MS);
  return true;
}

export function recordNodeSuccess(key: string): void {
  lastTimeout.delete(key);
  downUntil.delete(key);
}

/** Ile ms jeszcze odmawiamy (0 = węzeł dostępny). */
export function nodeDownFor(key: string, now = Date.now()): number {
  const t = downUntil.get(key);
  if (t == null) return 0;
  if (t <= now) {
    downUntil.delete(key);
    return 0;
  }
  return t - now;
}

/** Tylko do testów. */
export function resetNodeCircuits(): void {
  downUntil.clear();
  lastTimeout.clear();
}
