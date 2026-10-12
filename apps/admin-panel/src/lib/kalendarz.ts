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

/** Strefa operatorów i klientów — „dzień” usługi (odnowienie, anulacja) to dzień w Polsce, nie w UTC. */
export const STREFA_PL = 'Europe/Warsaw';

function czesciPl(d: Date) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-GB', {
    timeZone: STREFA_PL,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d)) p[x.type] = x.value;
  return { rok: +p.year!, miesiac: +p.month! - 1, dzien: +p.day!, godzina: +p.hour!, minuta: +p.minute!, sekunda: +p.second! };
}

/** Dzień chwili `d` w Polsce, w formacie pola daty („2026-11-27”). */
export function dzienPl(d: Date): string {
  const c = czesciPl(d);
  return naTekst({ rok: c.rok, miesiac: c.miesiac, dzien: c.dzien });
}

/** Ten sam zegar co `wzor` w Polsce, ale w dniu `d` (polskim) — z uwzględnieniem zmiany czasu letni/zimowy. */
export function dzienOGodziniePl(d: Dzien, wzor: Date): Date {
  const c = czesciPl(wzor);
  const lokalnie = Date.UTC(d.rok, d.miesiac, d.dzien, c.godzina, c.minuta, c.sekunda, wzor.getUTCMilliseconds());
  const przesuniecie = (t: number) => {
    const x = czesciPl(new Date(t));
    return Date.UTC(x.rok, x.miesiac, x.dzien, x.godzina, x.minuta, x.sekunda) - Math.floor(t / 1000) * 1000;
  };
  // Dwa kroki: przesunięcie strefy w szukanej chwili może być inne niż w chwili „lokalnie” traktowanej jak UTC.
  const t = lokalnie - przesuniecie(lokalnie);
  return new Date(lokalnie - przesuniecie(t));
}
