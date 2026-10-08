/**
 * Wywołanie akcji serwera z widoku klienta tak, żeby wyjątek nie zostawił formularza w stanie „ładuję…”.
 *
 * Po deployu karta otwarta wcześniej woła akcję, której nowy build już nie ma — Next rzuca
 * `UnrecognizedActionError` (https://nextjs.org/docs/messages/failed-to-find-server-action).
 * Jedyna naprawa po stronie klienta to przeładowanie strony, więc mówimy to wprost.
 */
export const KOMUNIKAT_PO_AKTUALIZACJI =
  'Panel został właśnie zaktualizowany — odśwież stronę (F5) i spróbuj ponownie. Wpisane dane trzeba będzie podać jeszcze raz.';

export async function bezpiecznaAkcja<T>(wywolanie: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await wywolanie();
  } catch (e) {
    const opis = e instanceof Error ? `${e.name} ${e.message}` : String(e);
    if (/UnrecognizedActionError|Server Action .* was not found/i.test(opis)) return { error: KOMUNIKAT_PO_AKTUALIZACJI };
    return { error: 'Nie udało się połączyć z panelem — sprawdź połączenie i spróbuj ponownie.' };
  }
}
