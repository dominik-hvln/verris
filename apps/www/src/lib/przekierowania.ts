/**
 * Stałe przekierowania verris.pl (next.config.ts → redirects). Bez importów — plik ładuje konfiguracja Next.
 * P3-11 (beta 3.11): „dla agencji” to nazwa z menu i reklam, a strona programu jest pod /reseller.
 */
export const PRZEKIEROWANIA: { source: string; destination: string; permanent: boolean }[] = [
  { source: '/dla-agencji', destination: '/reseller', permanent: true },
];
