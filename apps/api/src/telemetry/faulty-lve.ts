import type { LveFaultsReportDto } from './telemetry.dto.js';

/**
 * F2.6 — faulty limitów kont („508”): ile razy konto odbiło się od limitu CPU, procesów wejściowych (EP),
 * liczby procesów (NPROC), pamięci (PMEM), I/O i IOPS. Raport węzła trzymamy w `Server.lveFaults` (ostatni
 * raport agenta verris-lve, co ~10 min) — tylko konta z faultami, więc brak konta w oknie = 0 faultów,
 * a brak raportu albo błąd narzędzia = brak danych (nigdy zera).
 */
export const ZASOBY_FAULTOW = ['cpu', 'ep', 'nproc', 'pmem', 'io', 'iops'] as const;
export type ZasobFaultu = (typeof ZASOBY_FAULTOW)[number];
export type FaultyKonta = Record<ZasobFaultu, number>;
export type OknoFaultow = { godzin: 24 | 168; konta: Record<string, FaultyKonta>; obcieto: boolean };
export type RaportFaultow = { okna: OknoFaultow[]; blad: string | null };

/** Raport po telemetrii jest stary, gdy agent nie odświeżał go dłużej niż 3 cykle (cykl ~10 min). */
export const RAPORT_FAULTOW_WAZNY_MS = 30 * 60 * 1000;

const liczba = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0);

export const suma = (f: FaultyKonta) => ZASOBY_FAULTOW.reduce((s, k) => s + f[k], 0);

/** DTO z agenta → JSON do bazy (klucze po polsku jak reszta panelu; konta bez faultów odpadają). */
export function raportDoZapisu(dto: LveFaultsReportDto): RaportFaultow {
  const okna: OknoFaultow[] = [];
  for (const o of dto.windows ?? []) {
    const konta: Record<string, FaultyKonta> = {};
    for (const k of o.accounts) {
      const f = Object.fromEntries(ZASOBY_FAULTOW.map((z) => [z, liczba(k[z])])) as FaultyKonta;
      if (suma(f) > 0) konta[k.username] = f;
    }
    okna.push({ godzin: o.hours === 168 ? 168 : 24, konta, obcieto: o.truncated === true });
  }
  return { okna, blad: dto.error ? dto.error.slice(0, 300) : null };
}

/** JSON z bazy → raport; cokolwiek nieczytelnego = brak danych. */
export function raportZBazy(json: unknown): RaportFaultow | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as { okna?: unknown; blad?: unknown };
  const okna: OknoFaultow[] = [];
  for (const o of Array.isArray(j.okna) ? j.okna : []) {
    if (!o || typeof o !== 'object') continue;
    const { godzin, konta, obcieto } = o as Record<string, unknown>;
    if (godzin !== 24 && godzin !== 168) continue;
    const czyste: Record<string, FaultyKonta> = {};
    for (const [u, f] of Object.entries(konta && typeof konta === 'object' ? konta : {})) {
      const r = (f ?? {}) as Record<string, unknown>;
      czyste[u] = Object.fromEntries(ZASOBY_FAULTOW.map((z) => [z, liczba(r[z])])) as FaultyKonta;
    }
    okna.push({ godzin, konta: czyste, obcieto: obcieto === true });
  }
  return { okna, blad: typeof j.blad === 'string' ? j.blad : null };
}

export type FaultyKontaWidok = {
  /** Kiedy węzeł przysłał raport (null = nigdy — stary agent albo węzeł bez CloudLinux). */
  odczytano: string | null;
  /** Raport starszy niż 30 min — agent przestał raportować. */
  nieaktualne: boolean;
  blad: string | null;
  /** null = węzeł nie podał tego okna. */
  doba: FaultyKonta | null;
  tydzien: FaultyKonta | null;
};

const ZERO: FaultyKonta = { cpu: 0, ep: 0, nproc: 0, pmem: 0, io: 0, iops: 0 };

/** Faulty jednego konta z raportu węzła — zera tylko wtedy, gdy węzeł faktycznie podał okno bez tego konta. */
export function faultyKonta(
  serwer: { lveFaults: unknown; lveFaultsAt: Date | null },
  username: string,
  teraz: number,
): FaultyKontaWidok {
  const r = raportZBazy(serwer.lveFaults);
  const okno = (h: 24 | 168) => {
    const o = r?.okna.find((x) => x.godzin === h);
    return o ? (o.konta[username] ?? ZERO) : null;
  };
  return {
    odczytano: serwer.lveFaultsAt?.toISOString() ?? null,
    nieaktualne: !serwer.lveFaultsAt || teraz - serwer.lveFaultsAt.getTime() > RAPORT_FAULTOW_WAZNY_MS,
    blad: r?.blad ?? null,
    doba: okno(24),
    tydzien: okno(168),
  };
}

export type WierszPrzekroczenia = {
  serverId: string;
  wezel: string;
  username: string;
  subscriptionId: string | null;
  domena: string | null;
  doba: FaultyKonta | null;
  tydzien: FaultyKonta | null;
  razemDoba: number;
  razemTydzien: number;
};

export type StanWezlaFaultow = {
  serverId: string;
  wezel: string;
  odczytano: string | null;
  nieaktualne: boolean;
  blad: string | null;
  obcieto: boolean;
};

/**
 * Lista kont przekraczających limity na węzłach (flota albo jeden węzeł): każde konto, które ma faulty w dobie
 * albo w 7 dniach, posortowane od najgorszego w dobie. `konta` mapuje (węzeł, login) na usługę.
 */
export function przekroczeniaFloty(
  serwery: { id: string; name: string | null; hostname: string | null; lveFaults: unknown; lveFaultsAt: Date | null }[],
  konta: { serverId: string; daUsername: string; subscriptionId: string; domain: string | null }[],
  teraz: number,
): { wiersze: WierszPrzekroczenia[]; wezly: StanWezlaFaultow[] } {
  const usluga = new Map(konta.map((k) => [`${k.serverId}\u0000${k.daUsername}`, k]));
  const wiersze: WierszPrzekroczenia[] = [];
  const wezly: StanWezlaFaultow[] = [];
  for (const s of serwery) {
    const nazwa = s.name || s.hostname || s.id;
    const r = raportZBazy(s.lveFaults);
    wezly.push({
      serverId: s.id,
      wezel: nazwa,
      odczytano: s.lveFaultsAt?.toISOString() ?? null,
      nieaktualne: !s.lveFaultsAt || teraz - s.lveFaultsAt.getTime() > RAPORT_FAULTOW_WAZNY_MS,
      blad: r?.blad ?? null,
      obcieto: !!r?.okna.some((o) => o.obcieto),
    });
    if (!r) continue;
    const loginy = new Set(r.okna.flatMap((o) => Object.keys(o.konta)));
    for (const username of loginy) {
      const f = faultyKonta(s, username, teraz);
      const k = usluga.get(`${s.id}\u0000${username}`);
      wiersze.push({
        serverId: s.id,
        wezel: nazwa,
        username,
        subscriptionId: k?.subscriptionId ?? null,
        domena: k?.domain ?? null,
        doba: f.doba,
        tydzien: f.tydzien,
        razemDoba: f.doba ? suma(f.doba) : 0,
        razemTydzien: f.tydzien ? suma(f.tydzien) : 0,
      });
    }
  }
  wiersze.sort((a, b) => b.razemDoba - a.razemDoba || b.razemTydzien - a.razemTydzien || a.username.localeCompare(b.username));
  return { wiersze, wezly };
}
