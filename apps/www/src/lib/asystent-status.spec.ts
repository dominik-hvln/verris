/**
 * Asystent AI na verris.pl — widoczność z przełącznika w adminie (6.11.2026), nie z flagi budowania NEXT_PUBLIC_ASYSTENT.
 * Na starym kodzie test pada: nie było statusu z API, layout montował widget bez `wlaczony`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CZAS_STATUSU_MS, asystentDostepny } from './asystent-status';

const fetchOryginalny = global.fetch;

function odpowiedz(status: number, cialo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (typeof cialo === 'string') throw new SyntaxError('Unexpected token');
      return cialo;
    },
  } as Response;
}

describe('asystentDostepny – GET /public/asystent/status', () => {
  const apiUrl = process.env.API_URL;
  afterEach(() => {
    global.fetch = fetchOryginalny;
    if (apiUrl === undefined) delete process.env.API_URL;
    else process.env.API_URL = apiUrl;
  });

  it('{ dostepny: true } → true; adres z API_URL, cache danych 60 s i timeout', async () => {
    process.env.API_URL = 'http://api.test:3000/';
    const fetchMock = jest.fn(async () => odpowiedz(200, { dostepny: true }));
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await asystentDostepny()).toBe(true);
    const [url, opcje] = fetchMock.mock.calls[0] as unknown as [string, RequestInit & { next?: { revalidate?: number } }];
    expect(url).toBe('http://api.test:3000/public/asystent/status');
    expect(opcje.next).toEqual({ revalidate: 60 });
    expect(opcje.signal).toBeInstanceOf(AbortSignal);
    expect(opcje).not.toHaveProperty('cache');
    expect(CZAS_STATUSU_MS).toBeLessThanOrEqual(2000);
  });

  it.each([
    ['{ dostepny: false }', odpowiedz(200, { dostepny: false })],
    ['503', odpowiedz(503, { dostepny: true })],
    ['429 z limitu', odpowiedz(429, { message: 'Za dużo' })],
    ['zły JSON', odpowiedz(200, '<html>')],
    ['null', odpowiedz(200, null)],
    ['tekst zamiast boolean', odpowiedz(200, { dostepny: 'true' })],
  ])('%s → false', async (_opis, res) => {
    global.fetch = jest.fn(async () => res) as unknown as typeof fetch;
    expect(await asystentDostepny()).toBe(false);
  });

  it('API nie odpowiada → false po timeoucie (render strony nie czeka dłużej)', async () => {
    global.fetch = jest.fn(
      (_url: string, opcje: RequestInit) =>
        new Promise<Response>((_ok, blad) => {
          opcje.signal?.addEventListener('abort', () => blad(opcje.signal?.reason));
        }),
    ) as unknown as typeof fetch;
    const start = Date.now();
    expect(await asystentDostepny()).toBe(false);
    expect(Date.now() - start).toBeLessThan(CZAS_STATUSU_MS + 1000);
  });

  it('błąd sieci → false', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    expect(await asystentDostepny()).toBe(false);
  });
});

describe('layout verris.pl – widget z przełącznika w adminie', () => {
  const layout = readFileSync(join(__dirname, '../app/(frontend)/layout.tsx'), 'utf8');

  it('pobiera status po stronie serwera i przekazuje go do widgetu', () => {
    expect(layout).toContain('asystentDostepny()');
    expect(layout).toMatch(/<AsystentWidget wlaczony=\{asystent\} \/>/);
    expect(layout).not.toContain('NEXT_PUBLIC_ASYSTENT');
  });

  it('render per żądanie (headers()), bez statycznego trybu – status nie zamarza z czasu builda', () => {
    expect(layout).toContain('headers()');
    expect(layout).not.toMatch(/export const (dynamic|revalidate)\b/);
  });
});
