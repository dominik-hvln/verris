/**
 * Wpisy, które serwer zakłada w KATALOGU DOMOWYM konta na własne potrzeby. Klient ich nie widzi
 * (menedżer plików, „Co zajmuje miejsce”) i nie może na nich nic zrobić przez API — nazwy zdradzają
 * oprogramowanie serwera (biała etykieta), a skasowanie np. `.cagefs` psuje konto.
 * Tylko na najwyższym poziomie katalogu domowego: plik o tej samej nazwie w public_html to plik klienta.
 *
 * Każda nazwa ma uzasadnienie — nie dopisuj nic „na zapas”:
 * - `.cagefs` — katalog klatki CloudLinux: „/tmp directory is mounted for each user separately into
 *   ~username/.cagefs/tmp directory” (https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_os_components/#mount-points).
 * - `.imunify_patch_id`, `.myimunify_id` — identyfikatory konta dla Imunify Patch / MyImunify
 *   (https://docs.imunify360.com/imunify_patch/, https://docs.imunify360.com/myimunify/); same nazwy
 *   plików potwierdza obserwacja z prod (menedżer plików usługi d3, 12.10.2026), nie strona dokumentacji.
 */
export const UKRYTE_W_KATALOGU_DOMOWYM: ReadonlySet<string> = new Set([
  '.cagefs',
  '.imunify_patch_id',
  '.myimunify_id',
]);

/**
 * Czy ścieżka względem katalogu domowego (np. `/.cagefs/tmp/x`, `.cagefs`) leży w jednym z wpisów
 * systemowych. Oczekuje ścieżki już znormalizowanej (bez `..`), jak z `FilesService.safePath`
 * albo z wyniku `du` liczonego od katalogu domowego.
 */
export function jestWpisemSystemowym(sciezka: string): boolean {
  const pierwszy = sciezka.split('/').find((s) => s !== '');
  return pierwszy !== undefined && UKRYTE_W_KATALOGU_DOMOWYM.has(pierwszy);
}
