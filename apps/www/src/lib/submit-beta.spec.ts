/** Server action zgłoszenia do testów: adres endpointu, przekazanie IP/User-Agent, statusy błędów. */
jest.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '203.0.113.7'], ['user-agent', 'Testowa/1.0']]),
}));

import { submitBeta } from './submit-beta';
import { ZGODA_BETA, type ZgloszenieBeta } from './beta';

const Z: ZgloszenieBeta = { imie: 'Anna', email: 'anna@example.pl', zakres: ['WORDPRESS'], zgoda: true, zgodaTekst: ZGODA_BETA, pulapka: '' };

describe('submitBeta', () => {
  const fetchOrg = global.fetch;
  afterEach(() => {
    global.fetch = fetchOrg;
    delete process.env.API_URL;
  });

  it('POST /public/beta/zgloszenia z IP i User-Agent użytkownika', async () => {
    process.env.API_URL = 'https://api.example.test/';
    const f = jest.fn(async () => new Response(JSON.stringify({ status: 'pending' }), { status: 202 }));
    global.fetch = f as unknown as typeof fetch;
    await expect(submitBeta(Z)).resolves.toEqual({ ok: true, status: 202 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.test/public/beta/zgloszenia');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Testowa/1.0' });
    expect(JSON.parse(init.body as string)).toEqual(Z);
  });

  it('429 z API wraca jako status (formularz pokazuje komunikat o limicie)', async () => {
    global.fetch = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    await expect(submitBeta(Z)).resolves.toMatchObject({ ok: false, status: 429 });
  });

  it('błąd sieci → ok:false bez statusu', async () => {
    global.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    await expect(submitBeta(Z)).resolves.toEqual({ ok: false, error: 'ECONNREFUSED' });
  });
});
