/**
 * X-05 — snapshot pulpitu (X-39) i licznik otwartych zgłoszeń.
 *
 * CO PILNUJE.
 *  1. Awaria KAŻDEGO z siedmiu zapytań trafia do `errors` pod własnym kluczem.
 *     Wartość zastępcza (0, [], null) bez klucza błędu to fałszywa informacja:
 *     „saldo 0,00 K", „0 otwartych zgłoszeń" — podana z taką samą pewnością
 *     jak prawdziwa (X-39).
 *  2. Awaria jednego zapytania nie gasi pozostałych kafelków.
 *  3. „Otwarte zgłoszenia" liczą wszystko, co nie jest zamknięte — w tym
 *     `WAITING_CUSTOMER` („czekamy na Ciebie"). To jest dokładnie to zgłoszenie,
 *     które wymaga ruchu klienta; przed poprawką pulpit go nie liczył, a
 *     Centrum pomocy już tak — dwa ekrany, dwie różne odpowiedzi.
 */

const apiFetch = jest.fn();
const getWalletSummary = jest.fn();
const fetchUserProfile = jest.fn();
const fetchTickets = jest.fn();

jest.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));
jest.mock('./billing/data', () => ({ getWalletSummary: () => getWalletSummary() }));
jest.mock('./settings/actions', () => ({ fetchUserProfile: () => fetchUserProfile() }));
jest.mock('./support/actions', () => ({ fetchTickets: () => fetchTickets() }));

import { getDashboardSnapshot } from './dashboard-data';

const PATHS = ['/services', '/domains', '/users/me/eco-program', '/users/me/eco-ledger'] as const;

function allOk() {
  fetchUserProfile.mockResolvedValue({ email: 'a@b.pl', walletBalance: '12.00' });
  getWalletSummary.mockResolvedValue({ balance: '12.00' });
  fetchTickets.mockResolvedValue([]);
  apiFetch.mockImplementation(async (path: string) => {
    if (path === '/users/me/eco-program') return { ecoPoints: 7 };
    return [];
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  allOk();
});

describe('X-05 getDashboardSnapshot — błędy nie udają zera (X-39)', () => {
  it('wszystko OK → brak kluczy błędów', async () => {
    const s = await getDashboardSnapshot();
    expect(s.errors).toEqual({});
    expect(s.ecoProgram).toEqual({ ecoPoints: 7 });
  });

  it.each([
    ['profile', () => fetchUserProfile.mockRejectedValue(new Error('p'))],
    ['wallet', () => getWalletSummary.mockRejectedValue(new Error('w'))],
    ['tickets', () => fetchTickets.mockRejectedValue(new Error('t'))],
  ] as const)('awaria %s → klucz błędu, reszta snapshotu działa', async (key, fail) => {
    fail();
    const s = await getDashboardSnapshot();
    expect(Object.keys(s.errors)).toEqual([key]);
    expect(s.ecoProgram).toEqual({ ecoPoints: 7 });
  });

  it.each([
    ['/services', 'services'],
    ['/domains', 'domains'],
    ['/users/me/eco-program', 'ecoProgram'],
    ['/users/me/eco-ledger', 'ecoLedger'],
  ] as const)('awaria %s → errors.%s z komunikatem API', async (failPath, key) => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === failPath) throw Object.assign(new Error('API nie przyjmuje połączeń'), { status: 0 });
      return path === '/users/me/eco-program' ? { ecoPoints: 7 } : [];
    });
    const s = await getDashboardSnapshot();
    expect(s.errors).toEqual({ [key]: 'API nie przyjmuje połączeń' });
  });

  it('awaria wszystkiego → siedem kluczy, wartości zastępcze bez wyjątku', async () => {
    fetchUserProfile.mockRejectedValue(new Error('x'));
    getWalletSummary.mockRejectedValue(new Error('x'));
    fetchTickets.mockRejectedValue(new Error('x'));
    apiFetch.mockRejectedValue('nie-Error');
    const s = await getDashboardSnapshot();
    expect(Object.keys(s.errors).sort()).toEqual(
      ['domains', 'ecoLedger', 'ecoProgram', 'profile', 'services', 'tickets', 'wallet'].sort(),
    );
    expect(s.errors.services).toBe('Nie udało się pobrać danych z API');
    expect(s).toMatchObject({ profile: null, wallet: null, ecoProgram: null, services: [], domains: [], tickets: [] });
    expect(PATHS.every((p) => apiFetch.mock.calls.some(([c]) => c === p))).toBe(true);
  });
});

describe('X-05 getDashboardSnapshot — otwarte zgłoszenia', () => {
  it('liczy OPEN, IN_PROGRESS i WAITING_CUSTOMER, pomija CLOSED', async () => {
    fetchTickets.mockResolvedValue(
      ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED', 'CLOSED'].map((status, i) => ({ id: String(i), status })),
    );
    const s = await getDashboardSnapshot();
    expect(s.openTickets).toBe(3);
    expect(s.tickets).toHaveLength(5);
  });
});
