/**
 * Sprawdzane listy DNSBL — jedna lista dla diagnostyki klienta (DeliverabilityService) i monitoringu
 * floty (RblReputationScheduler).
 *
 * Usunięte: `dnsbl.sorbs.net` — SORBS zamknięty przez Proofpoint w czerwcu 2024 (strefa nie jest już
 * utrzymywana). Martwa strefa odpowiada NXDOMAIN albo timeoutem: pierwsze wyglądało jak „czysto”, drugie
 * dawało stałe „nie udało się sprawdzić”. Uwaga: `b.barracudacentral.org` odpowiada tylko resolverom
 * zarejestrowanym w Barracuda (darmowo) — bez rejestracji wynik tej strefy będzie „nieznany”.
 */
export const RBL_ZONES: readonly string[] = ['zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org'];

/**
 * Czy odpowiedź DNSBL oznacza wpis na liście. Wpis to adres 127.0.x.x
 * (Spamhaus 127.0.0.2–11, SpamCop/Barracuda 127.0.0.2). Adresy 127.255.255.x
 * to KODY BŁĘDU — np. .254 „zapytanie przez publiczny resolver”, .255 „za dużo
 * zapytań”. Pomiar 2026-09-23: panel pokazywał klientowi „IP serwera jest na
 * zen.spamhaus.org”, bo Spamhaus odrzucał zapytania z resolvera serwera.
 */
export function rblListed(answers: string[]): boolean {
  return answers.some((a) => a.startsWith('127.') && !a.startsWith('127.255.'));
}

/** Kody błędu DNS oznaczające „brak wpisu” (NXDOMAIN / brak rekordu A). Wszystko inne = nie wiemy. */
export function rblBrakWpisu(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'ENOTFOUND' || code === 'ENODATA';
}

/** Odpowiedź 127.255.255.x — lista odmówiła odpowiedzi (np. publiczny resolver, limit zapytań). */
export function rblOdmowa(answers: string[]): boolean {
  return !rblListed(answers) && answers.some((a) => a.startsWith('127.255.255.'));
}
