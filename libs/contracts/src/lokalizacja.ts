/**
 * P-13 — deklaracja lokalizacji danych klienta.
 *
 * `Server.region` był wolnym tekstem z domyślnym „PL” w kreatorze węzła, a węzeł #1
 * stoi w centrum danych Hetznera (Niemcy/Finlandia). Pokazanie klientowi „Polska”
 * na podstawie takiej wartości byłoby fałszywą deklaracją. Dlatego klient widzi
 * konkretne miejsce WYŁĄCZNIE dla kodów z tej listy; każda inna wartość daje ogólny
 * opis zgodny z listą podprocesorów (EOG, Hetzner).
 */
export const REGIONY_DANYCH = {
  'DE-FSN': 'Niemcy, Falkenstein (Hetzner)',
  'DE-NBG': 'Niemcy, Norymberga (Hetzner)',
  'FI-HEL': 'Finlandia, Helsinki (Hetzner)',
  'PL-WAW': 'Polska, Warszawa',
  'PL-POZ': 'Polska, Poznań',
} as const;

export type RegionDanych = keyof typeof REGIONY_DANYCH;

export const LOKALIZACJA_OGOLNA = 'Europejski Obszar Gospodarczy — centra danych Hetzner w Niemczech lub Finlandii';

export function opisLokalizacji(region: string | null | undefined): { opis: string; dokladna: boolean } {
  const r = (region ?? '').trim().toUpperCase();
  return r in REGIONY_DANYCH
    ? { opis: REGIONY_DANYCH[r as RegionDanych], dokladna: true }
    : { opis: LOKALIZACJA_OGOLNA, dokladna: false };
}
