/**
 * Badge na stronę klienta — czysta logika (bez bazy): dostępność per dzień,
 * warunki pieczęci i dopasowanie domeny osadzenia. Dane zbiera BadgesService.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Interval {
  from: number;
  to: number;
}

/** Przerwy z zakończonych awarii (RECOVERED + durationS) i trwającej (downSince). */
export function downIntervals(
  recovered: { createdAt: Date; durationS: number | null }[],
  downSince: Date | null,
  now: number,
): Interval[] {
  const out = recovered
    .filter((e) => (e.durationS ?? 0) > 0)
    .map((e) => ({ from: e.createdAt.getTime() - (e.durationS as number) * 1000, to: e.createdAt.getTime() }));
  if (downSince) out.push({ from: downSince.getTime(), to: now });
  return out;
}

function overlap(a: Interval, from: number, to: number): number {
  return Math.max(0, Math.min(a.to, to) - Math.max(a.from, from));
}

export interface DayUptime {
  /** Początek doby (UTC, ms). */
  day: number;
  /** null = monitor jeszcze nie działał — nie udajemy 100%. */
  pct: number | null;
  downS: number;
}

/**
 * Dostępność dla ostatnich `days` dób (UTC), najstarsza pierwsza.
 * ponytail: doby UTC, nie Europe/Warsaw — przesunięcie 1–2 h przy granicy doby;
 * lokalne doby dopiero, gdy klient to zauważy.
 */
export function dailyUptime(intervals: Interval[], monitorSince: number, now: number, days: number): DayUptime[] {
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const out: DayUptime[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = today - i * DAY_MS;
    const from = Math.max(day, monitorSince);
    const to = Math.min(day + DAY_MS, now);
    if (to <= from) {
      out.push({ day, pct: null, downS: 0 });
      continue;
    }
    const down = Math.min(to - from, intervals.reduce((acc, iv) => acc + overlap(iv, from, to), 0));
    out.push({ day, pct: (1 - down / (to - from)) * 100, downS: Math.round(down / 1000) });
  }
  return out;
}

/** Dostępność całego okna (tylko czas, gdy monitor działał). null = brak pomiaru. */
export function windowPct(intervals: Interval[], monitorSince: number, now: number, days: number): number | null {
  const from = Math.max(now - days * DAY_MS, monitorSince);
  if (now <= from) return null;
  const down = Math.min(now - from, intervals.reduce((acc, iv) => acc + overlap(iv, from, now), 0));
  return (1 - down / (now - from)) * 100;
}

export const SEAL_MIN_UPTIME = 99.5;

export type SealReason =
  | 'OK'
  | 'USLUGA_NIEAKTYWNA'
  | 'BRAK_MONITORA'
  | 'STRONA_NIE_DZIALA'
  | 'MONITOR_NIEAKTUALNY'
  | 'BRAK_SSL'
  | 'NISKA_DOSTEPNOSC';

export const SEAL_REASON_LABEL: Record<SealReason, string> = {
  OK: 'Pieczęć jest widoczna.',
  USLUGA_NIEAKTYWNA: 'Usługa nie jest aktywna.',
  BRAK_MONITORA: 'Włącz monitoring strony — pieczęć pokazuje jego dane.',
  STRONA_NIE_DZIALA: 'Monitor widzi teraz awarię strony.',
  MONITOR_NIEAKTUALNY: 'Monitor nie sprawdzał strony od ponad doby.',
  BRAK_SSL: 'Brak ważnego certyfikatu SSL.',
  NISKA_DOSTEPNOSC: `Dostępność z 30 dni poniżej ${SEAL_MIN_UPTIME.toString().replace('.', ',')}%.`,
};

/**
 * Pieczęć pokazujemy tylko wtedy, gdy każde jej twierdzenie jest prawdziwe.
 * Inaczej ramka jest pusta — lepiej nic niż zła wiadomość na stronie klienta.
 */
export function sealReason(input: {
  active: boolean;
  monitor: { enabled: boolean; lastStatus: string; lastCheckedAt: Date | null; tlsExpiresAt: Date | null } | null;
  uptime30: number | null;
  now: number;
}): SealReason {
  const m = input.monitor;
  if (!input.active) return 'USLUGA_NIEAKTYWNA';
  if (!m || !m.enabled) return 'BRAK_MONITORA';
  if (m.lastStatus === 'DOWN') return 'STRONA_NIE_DZIALA';
  if (!m.lastCheckedAt || input.now - m.lastCheckedAt.getTime() > DAY_MS) return 'MONITOR_NIEAKTUALNY';
  if (!m.tlsExpiresAt || m.tlsExpiresAt.getTime() <= input.now) return 'BRAK_SSL';
  if (input.uptime30 === null || input.uptime30 < SEAL_MIN_UPTIME) return 'NISKA_DOSTEPNOSC';
  return 'OK';
}

const bareHost = (h: string) => h.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');

/**
 * Czy ramkę osadzono na stronie tej domeny. Źródłem jest nagłówek Referer
 * (loader wymusza referrerpolicy="origin"); brak nagłówka = nie pokazujemy —
 * inaczej pieczęć dałoby się wkleić na obcą stronę z `no-referrer`.
 */
export function embeddedOnDomain(referer: string | undefined | null, domain: string, extraHosts: string[] = []): boolean {
  if (!referer) return false;
  let host: string;
  try {
    host = bareHost(new URL(referer).hostname);
  } catch {
    return false;
  }
  if (host === bareHost(domain)) return true;
  return extraHosts.some((h) => {
    try {
      return bareHost(new URL(h).hostname) === host;
    } catch {
      return false;
    }
  });
}

/** Poziom programu EKO wg punktów (ten sam na badge'ach i w panelu). */
export function ecoTier(points: number): string {
  if (points >= 100) return 'Las';
  if (points >= 30) return 'Gaj';
  if (points >= 10) return 'Sadzonka';
  return 'Pączek';
}
