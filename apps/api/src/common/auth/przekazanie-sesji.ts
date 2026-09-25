import { randomBytes } from 'crypto';

/**
 * Jednorazowe kody przekazania sesji między hostami (panel admina/obsługi → panel klienta przy
 * impersonacji, panel → grafana.verris.pl). W adresie URL idzie tylko losowy kod ważny 60 s,
 * wymieniany raz, po stronie serwera, na właściwy token — sam token nie trafia do historii
 * przeglądarki, logów proxy ani narzędzi nagrywających sesję.
 */
// ponytail: pamięć jednej repliki API — przy kilku replikach kod wydany na jednej nie wymieni się
// na drugiej (odmowa, nie dziura); przejście na Redis, gdy API dostanie więcej replik.
const kody = new Map<string, { token: string; wygasa: number }>();
const TTL_MS = 60_000;

function sprzataj(teraz: number) {
  for (const [k, v] of kody) if (v.wygasa <= teraz) kody.delete(k);
}

export function wydajKodPrzekazania(token: string, teraz = Date.now()): string {
  sprzataj(teraz);
  const kod = randomBytes(32).toString('base64url');
  kody.set(kod, { token, wygasa: teraz + TTL_MS });
  return kod;
}

/** Token dla kodu albo null (nieznany, wygasły, już użyty). Kod działa dokładnie raz. */
export function odbierzKodPrzekazania(kod: unknown, teraz = Date.now()): string | null {
  if (typeof kod !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(kod)) return null;
  const wpis = kody.get(kod);
  kody.delete(kod);
  sprzataj(teraz);
  return wpis && wpis.wygasa > teraz ? wpis.token : null;
}
