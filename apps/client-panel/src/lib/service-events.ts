import { SERVICE_EVENT_PL } from '@verris/contracts';
import { plForm } from './pl';

/** Zdarzenia usługi po polsku — źródło w `@verris/contracts` (wspólne z panelem obsługi). */
export const EVENT_LABEL = SERVICE_EVENT_PL;
export const EVENT_WARN = new Set(['PAYMENT_FAILED', 'SUSPENDED', 'PROVISIONING_FAILED', 'TRIAL_EXPIRED', 'CANCEL_SCHEDULED', 'MAIL_SENDING_BLOCKED']);


/** Kroki wewnętrzne (worker, powiadomienia) — mają sens dla obsługi, nie dla klienta. */
const TYLKO_DLA_OBSLUGI = new Set(['MIGRATION_WORKER_JOB_RETRYING', 'MIGRATION_WORKER_JOB_COMPLETED', 'MIGRATION_ATTENTION_NOTIFIED', 'MIGRATION_SECRETS_EXPIRING']);

/** Czy zdarzenie pokazujemy klientowi na osi „Co się działo”. */
export function widoczneDlaKlienta(type: string): boolean {
  return !TYLKO_DLA_OBSLUGI.has(type);
}

/**
 * Nieznany kod nie znika z osi, ale klient nie widzi angielskiego kodu („Migration bundle completed”,
 * próba bety 06.10) — dostaje ogólną etykietę, a słownik uzupełniamy w `@verris/contracts`.
 */
export function serviceEventLabel(type: string, details?: unknown): string {
  const d = details && typeof details === 'object' && !Array.isArray(details) ? (details as Record<string, unknown>) : {};
  const wiadomosci = (n: number) => `${n} ${plForm(n, 'wiadomość', 'wiadomości', 'wiadomości')}`;
  // Weryfikacja 11.10 (D3) — działania obsługi z liczbą/nazwą ze szczegółów zdarzenia (bez powodu i bez operatora).
  if (type === 'MAIL_SEND_LIMIT_CHANGED') {
    if (typeof d.limit === 'number') return `Obsługa Verris ustawiła dobowy limit wysyłki na ${wiadomosci(d.limit)}`;
    if (d.limit === null) {
      return typeof d.domyslny === 'number'
        ? `Obsługa Verris przywróciła domyślny dobowy limit wysyłki (${wiadomosci(d.domyslny)})`
        : 'Obsługa Verris przywróciła domyślny dobowy limit wysyłki';
    }
  }
  if (type === 'ADDON_ADDED' && typeof d.name === 'string' && d.name) {
    if (d.przedluzenie === true) {
      const doKiedy = typeof d.aktywnyDo === 'string' ? new Date(d.aktywnyDo) : null;
      const data = doKiedy && !Number.isNaN(doKiedy.getTime())
        ? ` do ${doKiedy.toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' })}`
        : '';
      return `Obsługa Verris przedłużyła dodatek „${d.name}”${data}${d.gratis === true ? ' (bez opłaty)' : ''}`;
    }
    return `Obsługa Verris dodała dodatek „${d.name}”${d.gratis === true ? ' (bez opłaty)' : ''}`;
  }
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

/**
 * Zawieszenie po karencji (GRACE_EXPIRED) — jedyne, które zdejmuje sama wpłata (API: renewal.scheduler.ts
 * zawieszonaPrzezKarencje). Zawieszenie „brak płatności” wybrane przez obsługę zdejmuje obsługa.
 */
export function zawieszonaPoKarencji(events: { type: string; createdAt: string; details?: unknown }[] | undefined): boolean {
  const ostatnie = [...(events ?? [])].filter((e) => e.type === 'SUSPENDED').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const d = ostatnie?.details;
  return !!d && typeof d === 'object' && !Array.isArray(d) && (d as { reason?: string }).reason === 'GRACE_EXPIRED';
}

/**
 * F3.5 — czy usługa ma zaplanowaną rezygnację na koniec okresu. Źródłem jest stan (`cancelAt`): zdarzenie
 * CANCEL_SCHEDULED zostaje w historii także po cofnięciu rezygnacji przez obsługę. Bez pola (starsze API) — po zdarzeniu.
 */
export function rezygnacjaZaplanowana(s: { status: string; cancelAt?: string | null; events?: { type: string }[] }): boolean {
  if (s.status !== 'ACTIVE') return false;
  return s.cancelAt !== undefined ? !!s.cancelAt : (s.events ?? []).some((e) => e.type === 'CANCEL_SCHEDULED');
}

/**
 * Weryfikacja 11.10 — termin usługi do nagłówka karty, list usług i pulpitu. Po rezygnacji na koniec okresu
 * usługa działa do `cancelAt` i się nie odnawia; nagłówek mówił „odnawia się 8 lis 2026”, lista — „Odnowienie 8 lis”.
 * `data` = do kiedy działa (rezygnacja) albo kiedy się odnowi; `null` — brak terminu.
 */
export function terminUslugi(s: {
  status: string;
  currentPeriodEnd: string | null;
  cancelAt?: string | null;
  events?: { type: string }[];
}): { rezygnacja: boolean; data: string | null } {
  // Zakończona usługa nie ma terminu odnowienia (anulacja od razu też ustawia cancelAt = chwila zakończenia).
  if (s.status === 'CANCELED' || s.status === 'EXPIRED') return { rezygnacja: false, data: null };
  // cancelAt w stanie (także przy zaległej płatności) — usługa się nie odnowi; bez pola (starsze API) — po zdarzeniu.
  if (s.cancelAt) return { rezygnacja: true, data: s.cancelAt };
  const rezygnacja = rezygnacjaZaplanowana(s);
  return { rezygnacja, data: s.currentPeriodEnd };
}

/** Ten sam termin jako tekst: „odnawia się 8 lis 2026” albo „działa do 8 lis 2026 · nie odnowi się”. */
export function opisTerminu(s: Parameters<typeof terminUslugi>[0], data: (iso: string) => string): string | null {
  const t = terminUslugi(s);
  if (!t.data) return null;
  return t.rezygnacja ? `działa do ${data(t.data)} · nie odnowi się` : `odnawia się ${data(t.data)}`;
}
