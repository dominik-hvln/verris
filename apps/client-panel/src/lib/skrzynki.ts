import type { HostingEmailAccountsResponseDto } from '@verris/contracts';
import { plForm } from '@/lib/pl';

/**
 * Noc 12.10 — lista skrzynek to suma po domenach konta. Gdy skrzynek części domen nie udało się odczytać,
 * API zwraca skrzynki pozostałych i `domenyZBledem`; klient widzi krótką informację zamiast „0 skrzynek”.
 * White label: bez nazwy panelu serwera ani węzła.
 */
export function komunikatSkrzynekZBledem(domeny: readonly string[] | null | undefined): string | null {
  const lista = (domeny ?? []).filter(Boolean);
  if (!lista.length) return null;
  return `Nie udało się wczytać skrzynek ${plForm(lista.length, 'domeny', 'domen', 'domen')} ${lista.join(', ')} — spróbuj ponownie za chwilę.`;
}

/** Skrzynki tej domeny są nieznane (błąd całej listy albo tej domeny) — liczba 0 byłaby nieprawdą. */
export function skrzynkiDomenyNieznane(mail: HostingEmailAccountsResponseDto | null, domena: string): boolean {
  if (!mail) return true;
  const d = domena.toLowerCase();
  if ((mail.domenyZBledem ?? []).some((x) => x.toLowerCase() === d)) return true;
  // Błąd odczytu (całej listy albo listy domen) — znane są tylko domeny, z których przyszły skrzynki.
  return !!mail.fetchError && !mail.rows.some((r) => r.email.toLowerCase().endsWith(`@${d}`));
}
