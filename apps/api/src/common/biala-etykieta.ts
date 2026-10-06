import { zdradzaPanelSerwera } from '@verris/contracts';

/**
 * White label: klient nie widzi nazwy panelu serwera (DirectAdmin/DA/CustomBuild), jego komend,
 * ścieżek, portu 2222 ani oprogramowania węzła. Wzorzec mieszka w `libs/contracts/src/komunikaty-hostingu.ts`
 * — ten sam sprawdza panel klienta i czyszczenie pól JSON (`fetchError`, `error` zadań).
 */
export { zdradzaPanelSerwera };

export const KOMUNIKAT_OGOLNY = 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';

/** Tekst dla klienta albo komunikat ogólny, gdy zdradza panel serwera. */
export function dlaKlienta(tekst: string): string {
  return zdradzaPanelSerwera(tekst) ? KOMUNIKAT_OGOLNY : tekst;
}
