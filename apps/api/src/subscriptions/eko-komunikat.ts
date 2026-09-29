/**
 * Komunikat dla klienta po przełączeniu trybu EKO. `applyEcoModeBackupCronPolicy` opisuje zmianę
 * słowami panelu serwera („W DirectAdmin zaktualizowano … zadań cron”, „Bez zmian harmonogramu w DA:
 * <błąd DA>”) — klient dostaje wersję bez nazwy panelu i bez surowego błędu (white label).
 * `wynik === null` — wywołanie rzuciło wyjątek.
 */
export function komunikatEkoDlaKlienta(
  wynik: { adjusted: number; notice: string | null } | null,
  eko: boolean,
): string | null {
  if (wynik && wynik.adjusted > 0) {
    return eko
      ? 'Zmieniliśmy harmonogram kopii zapasowych: teraz raz w tygodniu (w niedzielę, o tej samej godzinie).'
      : 'Zmieniliśmy harmonogram kopii zapasowych: przywróciliśmy kopie codzienne.';
  }
  if (!wynik || wynik.notice) {
    return 'Tryb EKO zapisany, ale harmonogramu kopii zapasowych nie udało się teraz zmienić. Przełącz tryb ponownie za chwilę.';
  }
  return null;
}
