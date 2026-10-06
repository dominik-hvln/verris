/**
 * P-13 — deklaracja lokalizacji danych klienta.
 *
 * `Server.region` był wolnym tekstem z domyślnym „PL” w kreatorze węzła, a węzeł #1
 * stoi w centrum danych Hetznera (Niemcy/Finlandia). Pokazanie klientowi „Polska”
 * na podstawie takiej wartości byłoby fałszywą deklaracją. Dlatego klient widzi
 * konkretne miejsce WYŁĄCZNIE dla kodów z tej listy; każda inna wartość daje ogólny
 * opis zgodny z listą podprocesorów (EOG). Nazwy dostawcy centrum danych nie pokazujemy w UI
 * (decyzja właściciela 06.10) — jest w dokumentach prawnych (lista podmiotów przetwarzających).
 */
export const REGIONY_DANYCH = {
  'DE-FSN': 'Niemcy, Falkenstein',
  'DE-NBG': 'Niemcy, Norymberga',
  'FI-HEL': 'Finlandia, Helsinki',
  'PL-WAW': 'Polska, Warszawa',
  'PL-POZ': 'Polska, Poznań',
} as const;

export type RegionDanych = keyof typeof REGIONY_DANYCH;

export const LOKALIZACJA_OGOLNA = 'Europejski Obszar Gospodarczy — centra danych w Niemczech lub Finlandii';

export function opisLokalizacji(region: string | null | undefined): { opis: string; dokladna: boolean } {
  const r = (region ?? '').trim().toUpperCase();
  return r in REGIONY_DANYCH
    ? { opis: REGIONY_DANYCH[r as RegionDanych], dokladna: true }
    : { opis: LOKALIZACJA_OGOLNA, dokladna: false };
}
