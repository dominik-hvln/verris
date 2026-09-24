/**
 * X-05 — liczniki menu bocznego (`fetchRailDataAction`).
 *
 * CO PILNUJE.
 *  - Awaria zapytania → `null` („brak danych"), nigdy `0`. Menu pokazuje
 *    „3 otwarte" przy zgłoszeniach; zero przy awarii to fałszywy spokój.
 *  - Licznik zgłoszeń liczy też `WAITING_CUSTOMER` — to zgłoszenie czeka na
 *    ruch klienta i jest ostatnim, które powinno zniknąć z licznika.
 *  - Anulowane i wygasłe usługi nie trafiają do menu; usługa niezdrowa albo
 *    nieaktywna dostaje znacznik ostrzeżenia.
 */

const apiFetch = jest.fn();
const fetchTickets = jest.fn();
jest.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
jest.mock('./support/actions', () => ({ fetchTickets: () => fetchTickets() }));

import { fetchRailDataAction } from './rail-actions';

const svc = (id: string, status: string, health = 'healthy') => ({
  id,
  status,
  planName: `Plan ${id}`,
  productKind: 'HOSTING',
  account: { domain: `${id}.pl`, status: 'ACTIVE' },
  health: { label: health, checks: { dnsOk: true, tlsOk: true } },
});

beforeEach(() => {
  jest.resetAllMocks();
});

describe('X-05 fetchRailDataAction', () => {
  it('awaria każdego źródła → null, nie zero', async () => {
    apiFetch.mockRejectedValue(new Error('down'));
    fetchTickets.mockRejectedValue(new Error('down'));
    await expect(fetchRailDataAction()).resolves.toEqual({
      services: null,
      domains: null,
      domainsExpiring: null,
      onboarding: null,
      openTickets: null,
    });
  });

  it('licznik zgłoszeń obejmuje WAITING_CUSTOMER, pomija CLOSED', async () => {
    apiFetch.mockResolvedValue([]);
    fetchTickets.mockResolvedValue(
      ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'].map((status) => ({ status })),
    );
    expect((await fetchRailDataAction()).openTickets).toBe(3);
  });

  it('pomija anulowane/wygasłe usługi i oznacza niezdrowe', async () => {
    apiFetch.mockImplementation(async (path: string) =>
      path === '/services'
        ? [svc('a', 'ACTIVE'), svc('b', 'CANCELED'), svc('c', 'EXPIRED'), svc('d', 'PAST_DUE'), svc('e', 'ACTIVE', 'critical')]
        : [],
    );
    fetchTickets.mockResolvedValue([]);
    const rail = await fetchRailDataAction();
    expect(rail.services?.map((s) => [s.id, s.warn])).toEqual([
      ['a', false],
      ['d', true],
      ['e', true],
    ]);
    expect(rail.domains).toBe(0);
    expect(rail.openTickets).toBe(0);
  });
});
