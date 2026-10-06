import { SERVICE_EVENT_PL } from '@verris/contracts';

/** Zdarzenia usługi po polsku — źródło w `@verris/contracts` (wspólne z panelem obsługi). */
export const EVENT_LABEL = SERVICE_EVENT_PL;
export const EVENT_WARN = new Set(['PAYMENT_FAILED', 'SUSPENDED', 'PROVISIONING_FAILED', 'TRIAL_EXPIRED', 'CANCEL_SCHEDULED']);


/** Kroki wewnętrzne (worker, powiadomienia) — mają sens dla obsługi, nie dla klienta. */
const TYLKO_DLA_OBSLUGI = new Set(['MIGRATION_WORKER_JOB_RETRYING', 'MIGRATION_WORKER_JOB_COMPLETED', 'MIGRATION_ATTENTION_NOTIFIED']);

/** Czy zdarzenie pokazujemy klientowi na osi „Co się działo”. */
export function widoczneDlaKlienta(type: string): boolean {
  return !TYLKO_DLA_OBSLUGI.has(type);
}

/**
 * Nieznany kod nie znika z osi, ale klient nie widzi angielskiego kodu („Migration bundle completed”,
 * próba bety 06.10) — dostaje ogólną etykietę, a słownik uzupełniamy w `@verris/contracts`.
 */
export function serviceEventLabel(type: string): string {
  return EVENT_LABEL[type] ?? 'Zmiana w usłudze';
}

/**
 * Dlaczego usługa jest wstrzymana — z ostatniego zdarzenia SUSPENDED. Baner „czeka na płatność”
 * pasuje tylko do blokady za płatność; wstrzymanie przez partnera (O-05) albo obsługę mówi co innego.
 */
export type PowodBlokady = 'platnosc' | 'partner' | 'obsluga' | null;

export function powodBlokady(
  status: string,
  events: { type: string; createdAt: string; details?: unknown }[] | undefined,
): PowodBlokady {
  if (status === 'PENDING_PAYMENT' || status === 'PAST_DUE') return 'platnosc';
  if (status !== 'SUSPENDED') return null;
  const ostatnie = [...(events ?? [])].filter((e) => e.type === 'SUSPENDED').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const d = ostatnie?.details;
  const reason = d && typeof d === 'object' && !Array.isArray(d) ? (d as { reason?: string }).reason : undefined;
  if (reason === 'RESELLER') return 'partner';
  if (reason === 'ABUSE' || reason === 'MANUAL_ADMIN' || reason === 'CUSTOMER_REQUEST') return 'obsluga';
  return 'platnosc';
}
