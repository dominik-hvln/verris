import { NodeTaskStatus } from '@verris/database';

/**
 * F3.2 — odczyt wyniku zadania WAF_HITS (ops/scripts/node-waf-hits.sh): ostatnie trafienia reguł ModSecurity dla domen
 * konta. Tylko pola bez treści żądań: czas, domena, adres klienta, metoda, ścieżka bez query, reguła, czy zablokowano.
 */
export interface TrafienieWaf {
  czas: string | null;
  domena: string;
  ip: string;
  metoda: string;
  sciezka: string;
  regula: string;
  opis: string;
  zablokowano: boolean;
  status: string;
}

export function trafieniaZLogu(log: string | null): TrafienieWaf[] {
  const out: TrafienieWaf[] = [];
  for (const l of (log ?? '').split('\n')) {
    const m = /^VERRIS_WAF ([^|]{1,25})\|([a-z0-9.-]{3,253})\|([0-9a-fA-F:.-]{1,45})\|([A-Z-]{1,10})\|([^|]{1,200})\|(\d{1,9})\|([^|]{0,150})\|([01])\|([0-9-]{1,3})$/.exec(l);
    if (!m || out.length >= 300) continue;
    out.push({
      czas: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(m[1]!) ? m[1]! : null,
      domena: m[2]!,
      ip: m[3]!,
      metoda: m[4]!,
      sciezka: m[5]!,
      regula: m[6]!,
      opis: m[7]!,
      zablokowano: m[8] === '1',
      status: m[9]!,
    });
  }
  return out;
}

/** Najczęstsze reguły (do szybkiej diagnozy „co blokuje”): id, opis, ile razy, ile zablokowano, ostatnio. */
export function regulyZTrafien(t: TrafienieWaf[]) {
  const mapa = new Map<string, { regula: string; opis: string; razy: number; zablokowano: number; ostatnio: string | null; domeny: string[] }>();
  for (const x of t) {
    const r = mapa.get(x.regula) ?? { regula: x.regula, opis: x.opis, razy: 0, zablokowano: 0, ostatnio: null, domeny: [] };
    r.razy += 1;
    if (x.zablokowano) r.zablokowano += 1;
    if (x.czas && (!r.ostatnio || x.czas > r.ostatnio)) r.ostatnio = x.czas;
    if (!r.domeny.includes(x.domena)) r.domeny.push(x.domena);
    mapa.set(x.regula, r);
  }
  return [...mapa.values()].sort((a, b) => b.razy - a.razy).slice(0, 20);
}

type Zadanie = { status: NodeTaskStatus; outputLog: string | null; errorMessage: string | null; createdAt: Date; completedAt: Date | null };

export function bladWaf(log: string | null, errorMessage: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.includes('[waf-hits] BŁĄD: '));
  if (l) return l.slice(l.indexOf('[waf-hits] BŁĄD: ') + '[waf-hits] BŁĄD: '.length).slice(0, 300);
  return (errorMessage ?? 'Zadanie na węźle nie powiodło się.').slice(0, 300);
}

/** Stan z ostatnich zadań WAF_HITS konta (najnowsze pierwsze). */
export function stanTrafien(zadania: Zadanie[]) {
  const wynik = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED) ?? null;
  const ostatnie = zadania[0] ?? null;
  const trafienia = trafieniaZLogu(wynik?.outputLog ?? null);
  const razem = /^VERRIS_WAF_RAZEM (\d+) (\d+)/m.exec(wynik?.outputLog ?? '');
  return {
    wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
    wczytano: wynik ? (wynik.completedAt ?? wynik.createdAt).toISOString() : null,
    razem: razem ? Number(razem[1]) : null,
    trafienia,
    reguly: regulyZTrafien(trafienia),
    blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladWaf(ostatnie.outputLog, ostatnie.errorMessage) : null,
  };
}
