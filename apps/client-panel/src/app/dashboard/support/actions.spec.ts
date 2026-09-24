/**
 * X-05 — `fetchTickets` zgłasza awarię zamiast zwracać pustą listę.
 *
 * CO PILNUJE. Pulpit (`dashboard-data.ts`, X-39) i menu boczne
 * (`rail-actions.ts`) odróżniają „brak zgłoszeń" od „nie wiemy" wyłącznie po
 * tym, czy `fetchTickets` rzuci. Przed poprawką funkcja połykała każdy błąd
 * (5xx, 401, zerwane połączenie) i zwracała `[]` — więc klient przy awarii
 * API widział na pulpicie „Otwarte zgłoszenia: 0", a klucz `errors.tickets`
 * nie pojawiał się nigdy. Ten plik pilnuje, że awaria jest awarią.
 */

const getAuthToken = jest.fn();
jest.mock('@/lib/auth', () => ({ getAuthToken: () => getAuthToken() }));
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => ({ value: 'jwt' }) }),
  headers: async () => ({ get: () => null }),
}));

import { fetchTickets } from './actions';

const realFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  getAuthToken.mockReset().mockResolvedValue('jwt');
});
afterAll(() => {
  global.fetch = realFetch;
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('X-05 fetchTickets', () => {
  it('zwraca listę zgłoszeń z API', async () => {
    fetchMock.mockResolvedValueOnce(json(200, [{ id: 't1', status: 'OPEN' }]));
    await expect(fetchTickets()).resolves.toEqual([{ id: 't1', status: 'OPEN' }]);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/tickets$/);
  });

  it('bez tokenu → pusta lista bez pytania API', async () => {
    getAuthToken.mockResolvedValue(undefined);
    await expect(fetchTickets()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('odpowiedź 5xx → błąd, nie pusta lista', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { message: 'Internal server error' }));
    await expect(fetchTickets()).rejects.toThrow('Internal server error');
  });

  it('brak połączenia → błąd, nie pusta lista', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(fetchTickets()).rejects.toBeDefined();
    spy.mockRestore();
  });
});
