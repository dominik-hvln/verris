/**
 * Paczka 129 — plik do importu bazy wgrywany z zakładki „Bazy danych”. Te same reguły co API
 * (db-transfer.service.ts: PLIK_RE, MAX_PLIKU_BAZY) — tutaj, żeby klient nie czekał na wysyłkę 25 MB po odmowę.
 */
export const MAX_PLIKU_BAZY = 25_000_000;
const NAZWA = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.sql(\.gz)?$/;

/** Komunikat błędu albo null, gdy plik można wysłać. */
export function bladPlikuBazy(plik: { name: string; size: number }): string | null {
  if (!/\.sql(\.gz)?$/i.test(plik.name)) return 'Wybierz plik .sql albo .sql.gz.';
  if (!NAZWA.test(plik.name)) {
    return 'Nazwa pliku może zawierać tylko litery bez polskich znaków, cyfry, kropki, myślniki i podkreślenia – zmień ją i spróbuj ponownie.';
  }
  if (plik.size === 0) return 'Plik jest pusty.';
  if (plik.size > MAX_PLIKU_BAZY) return 'Plik jest większy niż 25 MB – wgraj go przez FTP do katalogu baz.';
  return null;
}
