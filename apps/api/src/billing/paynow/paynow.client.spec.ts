import { createHmac } from 'crypto';
import {
  jsonAscii,
  PaynowBlad,
  PaynowClient,
  podpisPowiadomienia,
  podpisZadania,
  poprawnyPodpisPowiadomienia,
} from './paynow.client.js';

/**
 * Wektory z oficjalnej dokumentacji Paynow (publiczne klucze testowe sandboxa):
 * https://docs.paynow.pl/docs/v3/integration#calculating-signature
 * https://docs.paynow.pl/docs/v3/integration#notifications-signature
 * https://docs.paynow.pl/docs/v3/refunds (GET statusu zwrotu)
 */
const API_KEY = '97a55694-5478-43b5-b406-fb49ebfdd2b5';
const SIG_KEY = 'b305b996-bca5-4404-a0b7-2ccea3d2b64b';

describe('Paynow — podpis żądania v3', () => {
  it('wektor z dokumentacji: GET metod płatności (pusta treść, brak parametrów)', () => {
    expect(
      podpisZadania({ apiKey: API_KEY, signatureKey: SIG_KEY, idempotencyKey: 'd243fdb3-c287-484a-bb9c-58536f2794c1', body: '' }),
    ).toBe('fXwLZRwo0WiGll90PPl5oULX9VKA0gpFA/3+E+NRp5E=');
  });

  it('wektor z dokumentacji: GET statusu zwrotu', () => {
    expect(
      podpisZadania({ apiKey: API_KEY, signatureKey: SIG_KEY, idempotencyKey: '6228e8f1-4fd9-40bc-9660-37b03c968590', body: '' }),
    ).toBe('Aqy2xIQAZghJX4jdzeMZa7I/3WcI2saIAt0qzLoZiMU=');
  });

  it('treść żądania wchodzi do podpisu jako napis (ta sama struktura co SDK: headers, parameters, body)', () => {
    const body = '{"amount":100}';
    const oczekiwany = createHmac('sha256', SIG_KEY)
      .update(`{"headers":{"Api-Key":"${API_KEY}","Idempotency-Key":"k1"},"parameters":{},"body":"{\\"amount\\":100}"}`)
      .digest('base64');
    expect(podpisZadania({ apiKey: API_KEY, signatureKey: SIG_KEY, idempotencyKey: 'k1', body })).toBe(oczekiwany);
  });

  it('polskie znaki w treści idą jako \\uXXXX (zgodnie z json_encode w oficjalnym SDK), a JSON pozostaje ten sam', () => {
    const t = jsonAscii({ description: 'Doładowanie /portfela/' });
    expect(t).toBe('{"description":"Do\\u0142adowanie /portfela/"}');
    expect(JSON.parse(t)).toEqual({ description: 'Doładowanie /portfela/' });
  });
});

describe('Paynow — podpis powiadomienia', () => {
  // Treść z przykładu curl w dokumentacji (wcięcie 4 spacje, zamykający nawias bez wcięcia).
  const tresc = Buffer.from(
    '{\n    "paymentId": "NOLV-8F9-08K-WGD",\n    "externalId": "9fea23c7-cd5c-4884-9842-6f8592be65df",\n    "status": "CONFIRMED",\n    "modifiedAt": "2018-12-12T13:24:52"\n}',
  );

  it('wektor z dokumentacji', () => {
    expect(podpisPowiadomienia(SIG_KEY, tresc)).toBe('F69sbjUxBX4eFjfUal/Y9XGREbfaRjh/zdq9j4MWeHM=');
    expect(poprawnyPodpisPowiadomienia(SIG_KEY, tresc, 'F69sbjUxBX4eFjfUal/Y9XGREbfaRjh/zdq9j4MWeHM=')).toBe(true);
  });

  it('zły podpis, brak nagłówka, zmieniona treść albo inny klucz → odrzucone', () => {
    expect(poprawnyPodpisPowiadomienia(SIG_KEY, tresc, undefined)).toBe(false);
    expect(poprawnyPodpisPowiadomienia(SIG_KEY, tresc, 'abc')).toBe(false);
    expect(poprawnyPodpisPowiadomienia(SIG_KEY, Buffer.from(tresc.toString().replace('CONFIRMED', 'CONFIRMEE')), 'F69sbjUxBX4eFjfUal/Y9XGREbfaRjh/zdq9j4MWeHM=')).toBe(false);
    expect(poprawnyPodpisPowiadomienia('inny-klucz', tresc, 'F69sbjUxBX4eFjfUal/Y9XGREbfaRjh/zdq9j4MWeHM=')).toBe(false);
  });
});

describe('PaynowClient — żądania HTTP', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const odp = (status: number, dane: unknown) => ({ ok: status < 300, status, json: async () => dane });

  it('POST /v3/payments: Api-Key, Idempotency-Key, Signature liczony z wysłanej treści, kwota w groszach', async () => {
    fetchMock.mockResolvedValue(odp(201, { redirectUrl: 'https://paywall', paymentId: 'NOLV-8F9-08K-WGD', status: 'NEW' }));
    const c = new PaynowClient(API_KEY, SIG_KEY, 'https://api.sandbox.paynow.pl');
    const z = { amount: 4567, currency: 'PLN' as const, externalId: 'ext-1', description: 'Doładowanie', continueUrl: 'https://panel/x', buyer: { email: 'a@b.pl' } };
    const wynik = await c.utworzPlatnosc(z, 'idem-1');
    expect(wynik.paymentId).toBe('NOLV-8F9-08K-WGD');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.sandbox.paynow.pl/v3/payments');
    expect(init.method).toBe('POST');
    expect(init.headers['Api-Key']).toBe(API_KEY);
    expect(init.headers['Idempotency-Key']).toBe('idem-1');
    expect(init.headers.Signature).toBe(podpisZadania({ apiKey: API_KEY, signatureKey: SIG_KEY, idempotencyKey: 'idem-1', body: init.body }));
    expect(JSON.parse(init.body)).toEqual(z);
  });

  it('GET statusu: podpis z pustej treści, niepoprawny paymentId nie trafia do URL', async () => {
    fetchMock.mockResolvedValue(odp(200, { paymentId: 'NOLV-8F9-08K-WGD', status: 'CONFIRMED' }));
    const c = new PaynowClient(API_KEY, SIG_KEY, 'https://api.paynow.pl');
    await expect(c.statusPlatnosci('NOLV-8F9-08K-WGD')).resolves.toEqual({ paymentId: 'NOLV-8F9-08K-WGD', status: 'CONFIRMED' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.paynow.pl/v3/payments/NOLV-8F9-08K-WGD/status');
    expect(init.body).toBeUndefined();
    expect(init.headers.Signature).toBe(podpisZadania({ apiKey: API_KEY, signatureKey: SIG_KEY, idempotencyKey: init.headers['Idempotency-Key'], body: '' }));
    expect(() => c.statusPlatnosci('../admin')).toThrow();
  });

  it('błąd API → PaynowBlad z typami błędów (bez treści komunikatu)', async () => {
    fetchMock.mockResolvedValue(odp(400, { statusCode: 400, errors: [{ errorType: 'INSUFFICIENT_BALANCE_FUNDS', message: 'x' }] }));
    const c = new PaynowClient(API_KEY, SIG_KEY, 'https://api.sandbox.paynow.pl');
    const blad = await c.zwrot('NOLV-8F9-08K-WGD', { amount: 100, reason: 'OTHER' }, 'k').catch((e) => e);
    expect(blad).toBeInstanceOf(PaynowBlad);
    expect(blad.typyBledow).toEqual(['INSUFFICIENT_BALANCE_FUNDS']);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.sandbox.paynow.pl/v3/payments/NOLV-8F9-08K-WGD/refunds');
  });
});
