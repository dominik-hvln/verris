import { KOMUNIKAT_OGOLNY, zdradzaPanelSerwera } from '../common/biala-etykieta.js';

/**
 * Błąd zadania węzła w wersji dla klienta. `errorMessage` z agenta to surowy ogon logu
 * (ID zadania, ścieżki skryptów na węźle) — klient dostaje tylko ostatnią linię
 * „[skrypt] BŁĄD: …” / „[skrypt] ERROR: …”, którą skrypty piszą właśnie dla niego.
 */
// errorMessage agenta to ogon logu sklejony w jedną linię — komunikat kończy się na kolejnym znaczniku
// „[nazwa]” (np. „[VERRIS_APP] bez_zmian=1”, „[verris-task-run]”), który klient widział w panelu (D3 01.10).
const LINIA = /\[[a-z0-9-]+\] (?:BŁĄD|ERROR): (.+?)(?=\s+\[[A-Za-z0-9_-]+\]|\n|$)/g;

export function bladZadaniaDlaKlienta(errorMessage: string | null, outputLog?: string | null): string | null {
  if (!errorMessage) return null;
  const trafienia = [...`${outputLog ?? ''}\n${errorMessage}`.matchAll(LINIA)];
  const ostatnie = trafienia.at(-1)?.[1]?.trim();
  // White label: komunikat skryptu z nazwą panelu serwera (DirectAdmin/DA/CustomBuild) nie trafia do klienta.
  if (!ostatnie || zdradzaPanelSerwera(ostatnie)) return KOMUNIKAT_OGOLNY;
  return ostatnie.slice(0, 300);
}
