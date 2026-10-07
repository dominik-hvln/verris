import type { ProbeKind } from '@verris/database';

/**
 * Publiczna strona statusu — czyste funkcje: surowe próbki sond (kubełki 1-min) → paski dni,
 * procent dostępności, zdarzenia bez nazw węzłów. Bez bazy, żeby dało się testować.
 */

export type StanDnia = 'OK' | 'DEGRADED' | 'DOWN' | 'NO_DATA';

/**
 * Usługi widoczne klientom. SSH i DA_API to sondy wewnętrzne (węzeł / panel hostingowy),
 * nie mapują się na usługę, którą klient rozpoznaje — nie trafiają na publiczną stronę.
 */
export const USLUGI_PUBLICZNE: ReadonlyArray<{ key: string; name: string; kinds: readonly ProbeKind[] }> = [
  { key: 'strony', name: 'Strony klientów', kinds: ['HTTP', 'HTTPS'] },
  { key: 'poczta', name: 'Poczta', kinds: ['SMTP', 'IMAP', 'POP3'] },
  { key: 'bazy', name: 'Bazy danych', kinds: ['MYSQL'] },
  { key: 'dns', name: 'DNS', kinds: ['DNS'] },
];

export function uslugaDlaRodzaju(kind: ProbeKind) {
  return USLUGI_PUBLICZNE.find((u) => u.kinds.includes(kind)) ?? null;
}

/** Suma próbek z jednego dnia / godziny. `latencyWeighted` = Σ(avgLatencyMs × totalCount). */
export interface Kubelek {
  total: number;
  success: number;
  latencyWeighted: number;
}

export interface WierszKubelka extends Kubelek {
  /** 'YYYY-MM-DD' (dzień czasu polskiego) albo ISO godziny UTC. */
  key: string;
}

export interface DzienDto {
  date: string;
  state: StanDnia;
  uptimePct: number | null;
  avgLatencyMs: number | null;
}

export interface GodzinaDto {
  hour: string;
  avgLatencyMs: number | null;
}

/** Progi dnia: ≥99,9% działa; ≥99% spowolnienie (do ~14 min błędów); niżej awaria. Dzień bez próbek = brak danych. */
export function stanDnia(k: Kubelek | undefined): StanDnia {
  if (!k || k.total <= 0) return 'NO_DATA';
  // Arytmetyka całkowita — granice 99,9% i 99% nie zależą od błędów zmiennoprzecinkowych.
  if (k.success * 1000 >= k.total * 999) return 'OK';
  if (k.success * 100 >= k.total * 99) return 'DEGRADED';
  return 'DOWN';
}

/** Procent z obcięciem do 2 miejsc (nigdy nie zaokrągla 99,996 do 100). null = brak próbek. */
export function procentDostepnosci(kubelki: Array<Kubelek | undefined>): number | null {
  const { total, success } = lacz(kubelki);
  if (total <= 0) return null;
  return Math.floor((success / total) * 10000 + 1e-6) / 100;
}

/** Suma kubełków (np. godzin doby) w jeden. */
export function lacz(kubelki: Array<Kubelek | undefined>): Kubelek {
  const suma: Kubelek = { total: 0, success: 0, latencyWeighted: 0 };
  for (const k of kubelki) {
    if (!k) continue;
    suma.total += k.total;
    suma.success += k.success;
    suma.latencyWeighted += k.latencyWeighted;
  }
  return suma;
}

export function sredniCzas(k: Kubelek | undefined): number | null {
  return k && k.total > 0 ? Math.round(k.latencyWeighted / k.total) : null;
}

/** Scala wiersze (np. z wielu sond jednej usługi) po kluczu dnia/godziny. */
export function scalPoKluczu(wiersze: WierszKubelka[]): Map<string, Kubelek> {
  const m = new Map<string, Kubelek>();
  for (const w of wiersze) {
    const k = m.get(w.key) ?? { total: 0, success: 0, latencyWeighted: 0 };
    k.total += w.total;
    k.success += w.success;
    k.latencyWeighted += w.latencyWeighted;
    m.set(w.key, k);
  }
  return m;
}

/** Dzień kalendarzowy w Europe/Warsaw jako 'YYYY-MM-DD' (granice dni zgodne z SQL w StatusService). */
export function dzienWarszawski(t: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(t);
}

/** `n` kolejnych dni kończących się na `dzis`, rosnąco. Arytmetyka na dacie UTC — odporna na zmianę czasu. */
export function dniWstecz(dzis: string, n: number): string[] {
  const [y, m, d] = dzis.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const t = new Date(Date.UTC(y, m - 1, d - (n - 1 - i)));
    return t.toISOString().slice(0, 10);
  });
}

/** `n` kolejnych początków godzin UTC kończących się na bieżącej godzinie, rosnąco (ISO). */
export function godzinyWstecz(teraz: Date, n: number): string[] {
  const koniec = Math.floor(teraz.getTime() / 3_600_000) * 3_600_000;
  return Array.from({ length: n }, (_, i) => new Date(koniec - (n - 1 - i) * 3_600_000).toISOString());
}

export function paskiDni(dni: string[], kubelki: Map<string, Kubelek>): DzienDto[] {
  return dni.map((date) => {
    const k = kubelki.get(date);
    return { date, state: stanDnia(k), uptimePct: procentDostepnosci([k]), avgLatencyMs: sredniCzas(k) };
  });
}

export function seriaGodzin(godziny: string[], kubelki: Map<string, Kubelek>): GodzinaDto[] {
  return godziny.map((hour) => ({ hour, avgLatencyMs: sredniCzas(kubelki.get(hour)) }));
}

export interface ZdarzenieDto {
  id: string;
  service: string;
  severity: 'MINOR' | 'MAJOR';
  status: 'OPEN' | 'RESOLVED';
  title: string;
  publicMessage: string | null;
  startedAt: string;
  resolvedAt: string | null;
  durationMinutes: number | null;
}

/**
 * Awaria węzła odpala kilka sond tej samej usługi (HTTP + HTTPS, kilka węzłów) — dla klienta to jedno
 * zdarzenie. Scala zdarzenia tej samej usługi, o tym samym tytule, których przedziały się nakładają.
 */
export function zbijDuplikaty(zdarzenia: ZdarzenieDto[]): ZdarzenieDto[] {
  const wynik: ZdarzenieDto[] = [];
  const koniec = (z: ZdarzenieDto) => (z.resolvedAt ? Date.parse(z.resolvedAt) : Infinity);
  const posortowane = [...zdarzenia].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  for (const z of posortowane) {
    const dubel = wynik.find(
      (w) =>
        w.service === z.service &&
        w.title === z.title &&
        Date.parse(z.startedAt) <= koniec(w) &&
        Date.parse(w.startedAt) <= koniec(z),
    );
    if (!dubel) {
      wynik.push({ ...z });
      continue;
    }
    if (Date.parse(z.startedAt) < Date.parse(dubel.startedAt)) dubel.startedAt = z.startedAt;
    if (koniec(z) > koniec(dubel)) {
      dubel.resolvedAt = z.resolvedAt;
      dubel.status = z.status;
    }
    if (z.severity === 'MAJOR') dubel.severity = 'MAJOR';
    dubel.publicMessage ??= z.publicMessage;
    dubel.durationMinutes = dubel.resolvedAt
      ? Math.round((Date.parse(dubel.resolvedAt) - Date.parse(dubel.startedAt)) / 60000)
      : null;
  }
  return wynik.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}
