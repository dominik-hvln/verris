/**
 * P5-05 (paczka 109) — panel przekazuje do API przeglądarkę klienta (User-Agent), nie „node”. Bez tego każde
 * urządzenie na liście sesji i w historii logowań było „Nieznanym urządzeniem”, a dowód zgody miał `userAgent: node`.
 */
const headerGet = jest.fn();
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: headerGet }),
}));

import { apiFetch } from './api';

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const realFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  global.fetch = fetchMock as unknown as typeof fetch;
  headerGet.mockReset().mockImplementation((n: string) => (n === 'user-agent' ? UA : n === 'x-forwarded-for' ? '203.0.113.7' : null));
});
afterAll(() => {
  global.fetch = realFetch;
});

it('przekazuje User-Agent przeglądarki klienta', async () => {
  await apiFetch('/auth/login', { unauthenticated: true, method: 'POST', body: '{}' });
  expect((fetchMock.mock.calls[0][1].headers as Headers).get('user-agent')).toBe(UA);
});

it('nie nadpisuje User-Agent podanego przez wywołującego', async () => {
  await apiFetch('/x', { headers: { 'user-agent': 'verris-panel-cron' } });
  expect((fetchMock.mock.calls[0][1].headers as Headers).get('user-agent')).toBe('verris-panel-cron');
});
