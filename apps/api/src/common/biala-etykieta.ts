/**
 * White label: klient nie widzi nazwy panelu serwera (DirectAdmin/DA/CustomBuild), jego komend
 * (`CMD_API_*`), ścieżek (`/usr/local/directadmin`), portu 2222 ani kolejki zadań DA.
 *
 * „DA” tylko wielkimi literami i jako osobne słowo — `/\bDA\b/i` łapał polskie „nie da się”
 * i chował czytelny komunikat za ogólnym.
 */
const PANEL_SERWERA = /DirectAdmin|CustomBuild|CMD_API|task\.queue|\/usr\/local\/directadmin|:2222\b|\bpor(?:t\w*|cie) 2222\b/i;
const SKROT_PANELU = /\bDA\b/;

export const KOMUNIKAT_OGOLNY = 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';

export function zdradzaPanelSerwera(tekst: string): boolean {
  return PANEL_SERWERA.test(tekst) || SKROT_PANELU.test(tekst);
}

/** Tekst dla klienta albo komunikat ogólny, gdy zdradza panel serwera. */
export function dlaKlienta(tekst: string): string {
  return zdradzaPanelSerwera(tekst) ? KOMUNIKAT_OGOLNY : tekst;
}
