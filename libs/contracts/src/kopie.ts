/**
 * H-04 — kopie konta poza serwerem (off-site, node-offsite-backup.sh): wersja z każdego dnia przez tyle
 * dni, klient sam wybiera dzień i przywraca z panelu. Ta sama liczba stoi w panelu i na verris.pl;
 * zgodność z RETENTION_DAYS w skrypcie węzła pilnuje apps/api/src/test/kopie-30-dni.spec.ts.
 */
export const KOPIE_OFFSITE_DNI = 30;
