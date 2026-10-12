/**
 * Komunikat błędu odczytu stanu zapory — wspólny dla akcji serwera (waf-actions.ts) i zakładki WAF.
 * Osobny moduł, bo plik „use server” może eksportować wyłącznie funkcje async (next build odrzuca stałe;
 * deploy 12.10 padł na `export const` w waf-actions.ts — pilnuje tego test akcje-serwera-eksporty.spec.ts).
 */
export const BLAD_ODCZYTU_WAF = 'Nie udało się wczytać stanu zapory — spróbuj ponownie.';
