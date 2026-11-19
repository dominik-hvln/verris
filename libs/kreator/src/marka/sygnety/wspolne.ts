/**
 * Wspólne narzędzia rodzin sygnetów: definicja parametrów, odczyt z obcięciem do zakresu, ziarno, wpisanie znaku
 * w pole 0–100 i zapis warstw (kanał główny / akcent) do `<path>`.
 */
import type { ParametrySygnetu } from '../model.ts';
import type { ParametrRodziny } from '../typy.ts';
import { type Granice, type Ksztalt, granice, mapuj, sciezka } from '../geometria.ts';

export const par = (klucz: string, opis: string, min: number, max: number, domyslna: number): ParametrRodziny => ({
  klucz,
  opis,
  min,
  max,
  domyslna,
});

/** Parametry z obcięciem do zakresu i wartością domyślną dla brakujących (liczby całkowite). */
export function odczytaj(def: ParametrRodziny[], p: ParametrySygnetu | undefined): Record<string, number> {
  const wyn: Record<string, number> = {};
  for (const d of def) {
    const v = p?.[d.klucz];
    const x = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : d.domyslna;
    wyn[d.klucz] = Math.min(d.max, Math.max(d.min, x));
  }
  return wyn;
}

/** Deterministyczny generator (mulberry32). */
export function losowy(ziarno: number): () => number {
  let a = ziarno >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Warstwa {
  k: Ksztalt;
  kanal?: 'glowny' | 'akcent';
}

/**
 * Wpisuje warstwy w pole: środek granic w (50, 50), dłuższy bok = `rozmiar` (domyślnie 92 – margines optyczny
 * na antyaliasing i pole wokół w faviconie). Zapisuje je jako `<path>` (kolejność = kolejność rysowania).
 */
export function wyjscie(warstwy: Warstwa[], rozmiar = 92, ramka?: Granice): string {
  const wszystkie = warstwy.flatMap((w) => w.k);
  if (!wszystkie.length) return '';
  const g = ramka ?? granice(wszystkie);
  const s = rozmiar / Math.max(g.x1 - g.x0, g.y1 - g.y0, 1e-6);
  const cx = (g.x0 + g.x1) / 2;
  const cy = (g.y0 + g.y1) / 2;
  const f = (k: Ksztalt) => mapuj(k, ([x, y]) => [50 + (x - cx) * s, 50 + (y - cy) * s]);
  return warstwy.map((w) => sciezka(f(w.k), w.kanal ?? 'glowny')).join('');
}

/** Rozmiar w polu: wariant favicon wypełnia pole mocniej. */
export const rozmiarPola = (wariant: 'pelny' | 'favicon', pelny = 92) => (wariant === 'favicon' ? Math.min(98, pelny + 5) : pelny);
