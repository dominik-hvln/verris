/**
 * Daty i godziny w panelu klienta — zawsze w czasie polskim, niezależnie od strefy procesu.
 *
 * Nocna weryfikacja 12.10 (React #418 na produkcji): komponent kliencki renderuje się dwa razy — na serwerze
 * Next (kontener w UTC) i w przeglądarce (Europe/Warsaw). `toLocaleDateString('pl-PL')` bez `timeZone` dawał
 * na serwerze „7 lis”, a w przeglądarce „8 lis” (termin 23:30 UTC), a godziny różniły się zawsze o 1–2 h —
 * hydratacja się nie zgadzała i React przebudowywał całe drzewo. Stała strefa = ten sam tekst w obu miejscach
 * i ten sam czas, który klient widzi na zegarku (tak jak `godzina-harmonogramu.ts`).
 */
export const STREFA_PL = 'Europe/Warsaw';

type Chwila = string | number | Date;

/** Odpowiednik `toLocaleDateString('pl-PL', opcje)` w czasie polskim. */
export function dataPl(chwila: Chwila, opcje: Intl.DateTimeFormatOptions = {}): string {
  return new Date(chwila).toLocaleDateString('pl-PL', { ...opcje, timeZone: STREFA_PL });
}

/** Odpowiednik `toLocaleString('pl-PL', opcje)` (data z godziną) w czasie polskim. */
export function dataGodzinaPl(chwila: Chwila, opcje: Intl.DateTimeFormatOptions = {}): string {
  return new Date(chwila).toLocaleString('pl-PL', { ...opcje, timeZone: STREFA_PL });
}

/** Dzień kalendarzowy w Polsce jako „RRRR-MM-DD” — do grupowania i porównań („dziś”, wykres 7 dni). */
export function dzienPl(chwila: Chwila): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STREFA_PL, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(chwila));
}

/**
 * Ostatnie `n` dni kalendarzowych w Polsce (od najstarszego do dziś) jako „RRRR-MM-DD”. Liczone na datach,
 * nie przez odejmowanie 24 h — doba ze zmianą czasu ma 23 albo 25 godzin.
 */
export function ostatnieDniPl(n: number, dzis: Chwila = new Date()): string[] {
  const [r, m, d] = dzienPl(dzis).split('-').map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => new Date(Date.UTC(r, m - 1, d - (n - 1 - i), 12)).toISOString().slice(0, 10));
}
