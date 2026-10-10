import { promises as dns } from 'dns';

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

const DNS_TIMEOUT_MS = 3500;

async function zLimitem<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([p, new Promise<T>((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms); })]);
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Wynik IPv4 na listach RBL_ZONES: `listed` — wpis; `unknown` — timeout, błąd DNS inny niż NXDOMAIN/ENODATA albo
 * odmowa listy (127.255.255.x); reszta stref — czysto. Wspólne dla monitoringu floty (RblReputationScheduler)
 * i sprawdzenia na żądanie z karty węzła (F3.1). `resolve4` podmienialne w testach.
 */
export async function sprawdzIpNaRbl(
  ip: string,
  resolve4: (host: string) => Promise<string[]> = (h) => dns.resolve4(h),
): Promise<{ listed: string[]; unknown: string[] }> {
  const reversed = ip.split('.').reverse().join('.');
  const listed: string[] = [];
  const unknown: string[] = [];
  await Promise.all(
    RBL_ZONES.map(async (zone) => {
      try {
        const res: string[] = await zLimitem(resolve4(`${reversed}.${zone}`), DNS_TIMEOUT_MS);
        if (rblListed(res)) listed.push(zone);
        else if (rblOdmowa(res)) unknown.push(zone);
      } catch (err) {
        if (!rblBrakWpisu(err)) unknown.push(zone);
      }
    }),
  );
  return { listed, unknown };
}
