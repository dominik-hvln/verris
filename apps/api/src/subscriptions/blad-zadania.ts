/**
 * Błąd zadania węzła w wersji dla klienta. `errorMessage` z agenta to surowy ogon logu
 * (ID zadania, ścieżki skryptów na węźle) — klient dostaje tylko ostatnią linię
 * „[skrypt] BŁĄD: …” / „[skrypt] ERROR: …”, którą skrypty piszą właśnie dla niego.
 */
const LINIA = /\[[a-z0-9-]+\] (?:BŁĄD|ERROR): ([^\n]+)/g;

export function bladZadaniaDlaKlienta(errorMessage: string | null, outputLog?: string | null): string | null {
  if (!errorMessage) return null;
  const trafienia = [...`${outputLog ?? ''}\n${errorMessage}`.matchAll(LINIA)];
  const ostatnie = trafienia.at(-1)?.[1]?.trim();
  return ostatnie ? ostatnie.slice(0, 300) : 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
}
