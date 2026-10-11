import type { ServiceHealthSummaryDto } from '@verris/contracts';
import type { Tone } from '@/components/panel/v2';

export const HEALTH: Record<ServiceHealthSummaryDto['label'], { tone: Tone; text: string }> = {
  healthy: { tone: 'data', text: 'Wszystko działa' },
  attention: { tone: 'warn', text: 'Wymaga uwagi' },
  critical: { tone: 'warn', text: 'Problem z usługą' },
  pending: { tone: 'muted', text: 'Sprawdzamy usługę' },
};

/**
 * Weryfikacja 11.10 — tekst dla klienta, gdy obsługa wstrzymała wysyłkę poczty z konta (F3.1). Bez powodu (D3) i bez
 * nazw usług serwera; odbieranie działa (blokada dotyczy wysyłki z logowaniem i ze skryptów konta).
 */
export const WYSYLKA_WSTRZYMANA_OPIS =
  'Obsługa Verris wstrzymała wysyłkę poczty z tego konta — wiadomości nie wychodzą, odbieranie działa. Napisz do nas, a wyjaśnimy, co dalej.';

/**
 * Status w nagłówku karty usługi. Blokada wysyłki przez obsługę wygrywa z „Wszystko działa” — wcześniej nagłówek
 * mówił, że wszystko działa, choć poczta z konta nie wychodziła (d3, 11.10).
 */
export function statusZdrowia(health: Pick<ServiceHealthSummaryDto, 'label' | 'wysylkaWstrzymana'> | null): { tone: Tone; text: string } {
  if (health?.wysylkaWstrzymana) return { tone: 'warn', text: 'Wysyłka poczty wstrzymana' };
  return HEALTH[health?.label ?? 'pending'];
}
