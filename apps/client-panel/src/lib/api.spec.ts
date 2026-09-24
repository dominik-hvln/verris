/**
 * X-05 — `apiFetch`, przez który przechodzi KAŻDE zapytanie panelu do API.
 *
 * CO PILNUJE.
 *  - Token z ciasteczka trafia do API jako Bearer, a `unauthenticated` go nie
 *    wysyła (publiczne endpointy nie dostają cudzej sesji).
 *  - IP klienta (`x-forwarded-for`) jest przekazywane dalej — bez tego limity
 *    i blokady per-IP w API widzą jeden adres: kontener panelu.
 *  - Komunikat błędu jest wyciągany z każdego kształtu, jaki zwraca NestJS
 *    (string, tablica walidacji, zagnieżdżony obiekt) — klient widzi zdanie,
 *    nie „API 400".
 *  - Brak odpowiedzi (sieć/timeout) kończy się `ApiError` ze `status: 0`,
 *    odróżnialnym od 5xx (X-37/X-38).
 */

const cookieGet = jest.fn();
const headerGet = jest.fn();
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: cookieGet }),
  headers: async () => ({ get: headerGet }),
}));

import { ApiError, apiFetch } from './api';

const realFetch = global.fetch;
let fetchMock: jest.Mock;

function respond(status: number, body: unknown, json = true) {
  fetchMock.mockResolvedValueOnce(
    new Response(json ? JSON.stringify(body) : String(body), {
      status,
      headers: { 'content-type': json ? 'application/json' : 'text/plain' },
    }),
  );
}

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  cookieGet.mockReset().mockReturnValue({ value: 'jwt-123' });
  headerGet.mockReset().mockReturnValue('203.0.113.7');
});
afterAll(() => {
  global.fetch = realFetch;
});

function sentHeaders(): Headers {
  return fetchMock.mock.calls[0][1].headers as Headers;
}

describe('X-05 apiFetch — nagłówki', () => {
  it('dokleja Bearer z ciasteczka, IP klienta i Content-Type przy body', async () => {
    respond(200, { ok: 1 });
    await expect(apiFetch('/x', { method: 'POST', body: '{}' })).resolves.toEqual({ ok: 1 });
    const h = sentHeaders();
    expect(h.get('Authorization')).toBe('Bearer jwt-123');
    expect(h.get('x-forwarded-for')).toBe('203.0.113.7');
    expect(h.get('Content-Type')).toBe('application/json');
    expect(fetchMock.mock.calls[0][1].cache).toBe('no-store');
  });

  it('unauthenticated nie wysyła tokenu', async () => {
    respond(200, []);
    await apiFetch('/plans', { unauthenticated: true });
    expect(sentHeaders().has('Authorization')).toBe(false);
    expect(cookieGet).not.toHaveBeenCalled();
  });

  it('bez ciasteczka nie wysyła pustego Bearer', async () => {
    cookieGet.mockReturnValue(undefined);
    respond(200, {});
    await apiFetch('/x');
    expect(sentHeaders().has('Authorization')).toBe(false);
  });

  it('nie nadpisuje x-forwarded-for podanego przez wywołującego', async () => {
    respond(200, {});
    await apiFetch('/x', { headers: { 'x-forwarded-for': '198.51.100.1' } });
    expect(sentHeaders().get('x-forwarded-for')).toBe('198.51.100.1');
  });
});

describe('X-05 apiFetch — błędy', () => {
  async function errorOf(p: Promise<unknown>): Promise<ApiError> {
    try {
      await p;
    } catch (e) {
      return e as ApiError;
    }
    throw new Error('oczekiwano błędu');
  }

  it('message jako string', async () => {
    respond(402, { message: 'Brak środków w portfelu' });
    const e = await errorOf(apiFetch('/x'));
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe('Brak środków w portfelu');
    expect(e.status).toBe(402);
  });

  it('message jako tablica walidacji — sklejona, bez elementów nie-string', async () => {
    respond(400, { message: ['amount must be positive', 42, 'currency invalid'] });
    expect((await errorOf(apiFetch('/x'))).message).toBe('amount must be positive, currency invalid');
  });

  it('message zagnieżdżony (HttpException z obiektem)', async () => {
    respond(400, { message: { message: 'Kod wygasł' } });
    expect((await errorOf(apiFetch('/x'))).message).toBe('Kod wygasł');
    respond(400, { message: { message: ['a', 'b'] } });
    expect((await errorOf(apiFetch('/x'))).message).toBe('a, b');
  });

  it('odpowiedź tekstowa → treść; pusta → „API <status>"', async () => {
    respond(503, 'Service Unavailable', false);
    expect((await errorOf(apiFetch('/x'))).message).toBe('Service Unavailable');
    respond(500, {});
    expect((await errorOf(apiFetch('/x'))).message).toBe('API 500');
  });

  it('brak odpowiedzi → ApiError ze status 0 i polskim komunikatem', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(
      Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }),
    );
    const e = await errorOf(apiFetch('/services'));
    expect(e.status).toBe(0);
    expect(e.message).toBe('API nie przyjmuje połączeń');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
