/**
 * P-13 — region centrum danych węzła (informacja operatora: kreator węzła, wykresy, karta węzła).
 *
 * `Server.region` był wolnym tekstem z domyślnym „PL” w kreatorze węzła — lista niżej porządkuje kody.
 * P5-11 (decyzja 3.11.2026): klient NIE widzi regionu ani miasta — w panelu klienta lokalizacja danych to
 * zawsze „Unia Europejska” (`lokalizacja-klienta.ts`). Moduł nie jest częścią wejścia `@verris/contracts/klient`.
 */
export const REGIONY_DANYCH = {
  'DE-FSN': 'Niemcy, Falkenstein',
  'DE-NBG': 'Niemcy, Norymberga',
  'FI-HEL': 'Finlandia, Helsinki',
  'PL-WAW': 'Polska, Warszawa',
  'PL-POZ': 'Polska, Poznań',
} as const;

export type RegionDanych = keyof typeof REGIONY_DANYCH;

export const LOKALIZACJA_OGOLNA = 'Europejski Obszar Gospodarczy – centra danych w Niemczech lub Finlandii';
