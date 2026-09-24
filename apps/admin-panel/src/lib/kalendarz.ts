/** Czyste funkcje kalendarza dla `PoleDaty` — format wartości jak w natywnym `<input type="date|datetime-local">`. */

export const MIESIACE = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
export const DNI_TYGODNIA = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];

export interface Dzien {
  rok: number;
  miesiac: number; // 0–11
  dzien: number;
}

const dwa = (n: number) => String(n).padStart(2, '0');

export function naTekst(d: Dzien): string {
  return `${d.rok}-${dwa(d.miesiac + 1)}-${dwa(d.dzien)}`;
}

/** „2026-09-24” albo „2026-09-24T14:30” → części; śmieci → null. */
export function rozbierz(wartosc: string | undefined): { dzien: Dzien; godzina: number; minuta: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(wartosc ?? '');
  if (!m) return null;
  const dzien = { rok: +m[1]!, miesiac: +m[2]! - 1, dzien: +m[3]! };
  if (dzien.miesiac > 11 || dzien.dzien < 1 || dzien.dzien > dniWMiesiacu(dzien.rok, dzien.miesiac)) return null;
  return { dzien, godzina: m[4] ? +m[4] : 0, minuta: m[5] ? +m[5] : 0 };
}

export function zloz(d: Dzien, godzina?: number, minuta?: number): string {
  return godzina === undefined ? naTekst(d) : `${naTekst(d)}T${dwa(godzina)}:${dwa(minuta ?? 0)}`;
}

/** „24.09.2026” / „24.09.2026, 14:30” — do przycisku pola. */
export function doWyswietlenia(wartosc: string, zGodzina: boolean): string {
  const r = rozbierz(wartosc);
  if (!r) return '';
  const data = `${dwa(r.dzien.dzien)}.${dwa(r.dzien.miesiac + 1)}.${r.dzien.rok}`;
  return zGodzina ? `${data}, ${dwa(r.godzina)}:${dwa(r.minuta)}` : data;
}

export function dniWMiesiacu(rok: number, miesiac: number): number {
  return new Date(Date.UTC(rok, miesiac + 1, 0)).getUTCDate();
}

/** Siatka 6×7 od poniedziałku, z dniami sąsiednich miesięcy na brzegach. */
export function siatkaMiesiaca(rok: number, miesiac: number): Dzien[] {
  const pierwszy = new Date(Date.UTC(rok, miesiac, 1));
  const przesuniecie = (pierwszy.getUTCDay() + 6) % 7; // poniedziałek = 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(rok, miesiac, 1 - przesuniecie + i));
    return { rok: d.getUTCFullYear(), miesiac: d.getUTCMonth(), dzien: d.getUTCDate() };
  });
}

/** Dzień przesunięty o `dni` (klawiatura w siatce, także przez granice miesięcy). */
export function przesun(d: Dzien, dni: number): Dzien {
  const x = new Date(Date.UTC(d.rok, d.miesiac, d.dzien + dni));
  return { rok: x.getUTCFullYear(), miesiac: x.getUTCMonth(), dzien: x.getUTCDate() };
}

export function przesunMiesiac(d: Dzien, o: number): Dzien {
  const cel = new Date(Date.UTC(d.rok, d.miesiac + o, 1));
  const rok = cel.getUTCFullYear();
  const miesiac = cel.getUTCMonth();
  return { rok, miesiac, dzien: Math.min(d.dzien, dniWMiesiacu(rok, miesiac)) };
}

export function dzis(): Dzien {
  const t = new Date();
  return { rok: t.getFullYear(), miesiac: t.getMonth(), dzien: t.getDate() };
}

export const taSamaData = (a: Dzien | null | undefined, b: Dzien | null | undefined) =>
  !!a && !!b && a.rok === b.rok && a.miesiac === b.miesiac && a.dzien === b.dzien;
