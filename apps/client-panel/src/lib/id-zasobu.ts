/**
 * Identyfikatory zasobów (usługa, migracja, faktura…) są UUID. Wartość z linku albo z query (Next 16 dekoduje
 * searchParams w całości) sprawdzamy, zanim trafi do ścieżki żądania API — inaczej „.\t./”, „?” czy „#” kierują
 * żądanie z tokenem zalogowanego klienta do innej trasy (noc 15.10, przegląd client-apifetch-path).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jestIdZasobu(x: unknown): x is string {
  return typeof x === 'string' && UUID.test(x);
}

/** UUID zakodowany do segmentu ścieżki; inna wartość → błąd z polskim komunikatem dla klienta. */
export function idZasobu(x: unknown): string {
  if (!jestIdZasobu(x)) throw new Error('Link jest niepoprawny — otwórz go jeszcze raz z maila albo przejdź do zakładki Migracje.');
  return encodeURIComponent(x);
}
