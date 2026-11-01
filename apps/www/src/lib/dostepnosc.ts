/**
 * Dostępność dzień po dniu do paska na verris.pl („Nie ukrywamy awarii”) — z tego samego GET /status co
 * status.verris.pl. Klasy dni jak w apps/status-page/src/lib/widok.ts: dzień z dostępnością ≥ 99,65% (do ok.
 * 5 minut przerwy) to „krótkie zakłócenie”, nie awaria. Dni sprzed uruchomienia pomiarów są pomijane.
 */
export type KlasaDnia = 'ok' | 'krotkie' | 'spowolnienie' | 'awaria' | 'prace';

export const PROG_KROTKIEGO_PCT = 99.65;

export type DzienDostepnosci = { data: string; klasa: KlasaDnia; dostepnosc: number | null };

export type Dostepnosc = {
  dni: DzienDostepnosci[];
  /** Dostępność z 30 dni i z ostatnich 24 h, w %. */
  d30: number | null;
  h24: number | null;
};

type DzienApi = { date?: unknown; state?: unknown; uptimePct?: unknown };
type UslugaApi = { days?: unknown };

const STANY = ['OK', 'DEGRADED', 'DOWN', 'NO_DATA', 'MAINTENANCE'] as const;
type Stan = (typeof STANY)[number];
const WAGA: Record<Stan, number> = { NO_DATA: 0, OK: 1, MAINTENANCE: 2, DEGRADED: 3, DOWN: 4 };

function klasa(stan: Stan, dostepnosc: number | null): KlasaDnia | null {
  if (stan === 'NO_DATA') return null;
  if (stan === 'MAINTENANCE') return 'prace';
  if (stan === 'OK') return 'ok';
  if (dostepnosc !== null && dostepnosc >= PROG_KROTKIEGO_PCT) return 'krotkie';
  return stan === 'DOWN' ? 'awaria' : 'spowolnienie';
}

/**
 * Łączy usługi w jeden pasek: dzień ma najgorszy stan spośród usług i najniższą dostępność.
 * Zwraca null przy nieczytelnej odpowiedzi (wtedy komponent się nie renderuje).
 */
export function parsujDostepnosc(dane: unknown, ileDni = 30): Dostepnosc | null {
  if (!dane || typeof dane !== 'object') return null;
  const d = dane as { services?: unknown; availability?: { d30?: unknown; h24?: unknown } };
  const uslugi = Array.isArray(d.services) ? (d.services as UslugaApi[]) : [];
  const listy = uslugi.map((u) => (Array.isArray(u.days) ? (u.days as DzienApi[]) : [])).filter((l) => l.length > 0);
  if (listy.length === 0) return null;
  const dlugosc = Math.min(...listy.map((l) => l.length));
  const dni: DzienDostepnosci[] = [];
  for (let i = dlugosc - Math.min(ileDni, dlugosc); i < dlugosc; i++) {
    let stan: Stan = 'NO_DATA';
    let min: number | null = null;
    let data = '';
    for (const l of listy) {
      const x = l[l.length - dlugosc + i];
      const s = (STANY as readonly string[]).includes(String(x?.state)) ? (x.state as Stan) : 'NO_DATA';
      if (WAGA[s] > WAGA[stan]) stan = s;
      const u = typeof x?.uptimePct === 'number' ? x.uptimePct : null;
      if (u !== null) min = min === null ? u : Math.min(min, u);
      if (typeof x?.date === 'string') data = x.date;
    }
    const k = klasa(stan, min);
    if (k) dni.push({ data, klasa: k, dostepnosc: min });
  }
  if (dni.length === 0) return null;
  const liczbaLubNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return { dni, d30: liczbaLubNull(d.availability?.d30), h24: liczbaLubNull(d.availability?.h24) };
}

const MIESIACE = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const NAZWA: Record<KlasaDnia, string> = {
  ok: 'wszystko działało',
  krotkie: 'krótkie zakłócenie',
  spowolnienie: 'spowolnienie',
  awaria: 'awaria',
  prace: 'planowane prace',
};

/** „99,73%” */
export function procent(v: number): string {
  return `${String(v).replace('.', ',')}%`;
}

/** „13 paź: awaria · dostępność 72,22%” */
export function opisDnia(d: DzienDostepnosci): string {
  const [, m, dzien] = d.data.split('-');
  const kiedy = m && dzien ? `${Number(dzien)} ${MIESIACE[Number(m) - 1] ?? ''}` : d.data;
  return `${kiedy}: ${NAZWA[d.klasa]}${d.dostepnosc !== null ? ` · dostępność ${procent(d.dostepnosc)}` : ''}`;
}

/** Serwerowo, z cache danych Next na 5 minut. null — API nie odpowiedziało (pasek się wtedy nie pokazuje). */
export async function pobierzDostepnosc(): Promise<Dostepnosc | null> {
  if (process.env.NODE_ENV === 'test') return null;
  const api = (process.env.API_URL || 'http://api:3000').replace(/\/$/, '');
  try {
    const res = await fetch(`${api}/status`, { next: { revalidate: 300, tags: ['status'] }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return parsujDostepnosc(await res.json());
  } catch {
    return null;
  }
}
