/**
 * Weryfikacja 11.10 — co klient może zrobić z kopią pobraną spoza serwera („Pobierz na serwer”).
 *
 * Kopie poza serwerem to od przebudowy node-offsite-backup.sh archiwa administratora konta
 * (`user.<właściciel>.<login>.tar.*`, `admin-backup` panelu serwera), a nie kopie użytkownika z katalogu `backups`.
 * Węzeł kopiuje je do katalogu `backups` konta, ale lista kopii klienta (lista kopii użytkownika na serwerze)
 * ich nie pokazuje — weryfikacja na produkcji 11.10 (konto d3): widać tylko `backup-*.tar.zst`
 * i `verris-wp-*.tar.gz`. Przywrócenie z panelu klienta (HostingRestoreService) przyjmuje wyłącznie kopie
 * z tej listy, więc komunikat „Wybierz je z listy kopii powyżej” był nieprawdą. Mówimy to, co jest: archiwum
 * na liście — przywróć z listy; poza listą — plik jest w katalogu `backups` (do pobrania w Menedżerze plików),
 * a przywrócenie konta z niego wykonuje obsługa (odtworzenie kopii administratora, ops/scripts/node-account-restore.sh).
 */
export type PobranaKopia = 'na-liscie' | 'przez-obsluge';

export function pobranaKopia(archiwum: string, kopieNaLiscie: readonly string[]): PobranaKopia {
  return kopieNaLiscie.includes(archiwum) ? 'na-liscie' : 'przez-obsluge';
}
