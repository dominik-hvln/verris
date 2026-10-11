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

/**
 * Audyt Fal 2 — nazwy, hosty (także host API panelu) i adresy węzłów z bazy: dokładne dopasowanie dla
 * `zdradzaInfrastrukture` (raport pomigracyjny, eksport RODO), zamiast zgadywania wzorca nazw węzłów.
 */
export async function wezlyBialejEtykiety(prisma: {
  server: { findMany(a: { select: { name: true; hostname: true; daHost: true; ipAddress: true; ipv6Address: true } }): Promise<Array<Record<string, string | null>>> };
}): Promise<Array<string | null>> {
  const s = await prisma.server.findMany({ select: { name: true, hostname: true, daHost: true, ipAddress: true, ipv6Address: true } });
  return s.flatMap((w) => [w.name, w.hostname, w.daHost, w.ipAddress, w.ipv6Address]);
}
