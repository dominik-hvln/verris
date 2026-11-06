jest.mock('next/headers', () => ({
  headers: async () => new Map([['x-forwarded-for', '203.0.113.7'], ['user-agent', 'Przegladarka/1.0']]),
}));

import { poprosOTelefonZRozmowy, zapytajAsystenta } from './asystent';

type Wywolanie = [string, { headers: Record<string, string>; body: string }];

describe('asystent www – server actions', () => {
  const fetchOrig = global.fetch;
  let odp: { status: number; body: unknown };
  const fetchMock = jest.fn(async (...a: unknown[]) => (void a, {
    ok: odp.status >= 200 && odp.status < 300,
    status: odp.status,
    json: async () => odp.body,
  }));
  beforeEach(() => {
    fetchMock.mockClear();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.API_URL = 'http://api.test/';
  });
  afterAll(() => {
    global.fetch = fetchOrig;
  });

  it('POST /public/asystent z IP i User-Agent odwiedzającego, bez pustych pól', async () => {
    odp = { status: 200, body: { rozmowaId: 'r1', odpowiedz: 'Tak.', zrodla: [], nieWiem: false } };
    const r = await zapytajAsystenta({ rozmowaId: null, pytanie: '  Ile kosztuje hosting?  ' });
    expect(r).toEqual({ ok: true, dane: { rozmowaId: 'r1', odpowiedz: 'Tak.', zrodla: [], nieWiem: false } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as Wywolanie;
    expect(url).toBe('http://api.test/public/asystent');
    expect(init.headers).toMatchObject({ 'x-forwarded-for': '203.0.113.7', 'user-agent': 'Przegladarka/1.0' });
    expect(JSON.parse(init.body)).toEqual({ pytanie: 'Ile kosztuje hosting?' });
  });

  it('błąd z kodem (captcha) wraca do widgetu', async () => {
    odp = { status: 400, body: { statusCode: 400, kod: 'CAPTCHA_WYMAGANA', message: 'Potwierdź, że nie jesteś botem.' } };
    expect(await zapytajAsystenta({ rozmowaId: 'r1', pytanie: 'Czwarte', captchaToken: 't' })).toEqual({
      ok: false,
      status: 400,
      kod: 'CAPTCHA_WYMAGANA',
      komunikat: 'Potwierdź, że nie jesteś botem.',
    });
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as Wywolanie)[1].body)).toEqual({ pytanie: 'Czwarte', rozmowaId: 'r1', captchaToken: 't' });
  });

  it('puste pytanie nie idzie do API; błąd sieci → status 0; zła odpowiedź → 502', async () => {
    expect(await zapytajAsystenta({ pytanie: '   ' })).toMatchObject({ ok: false, status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await zapytajAsystenta({ pytanie: 'Hej' })).toEqual({ ok: false, status: 0 });
    odp = { status: 200, body: { cos: 'innego' } };
    expect(await zapytajAsystenta({ pytanie: 'Hej' })).toEqual({ ok: false, status: 502 });
  });

  it('prośba o telefon z okna asystenta wysyła rozmowaId do /public/leads/callback', async () => {
    odp = { status: 202, body: { status: 'received' } };
    const r = await poprosOTelefonZRozmowy({ name: 'Ola', phone: '600123456', preferredTime: 'rano', consentText: 'Numer…', rozmowaId: 'r1' });
    expect(r).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as Wywolanie;
    expect(url).toBe('http://api.test/public/leads/callback');
    expect(JSON.parse(init.body)).toMatchObject({ name: 'Ola', phone: '600123456', rozmowaId: 'r1' });
  });
});
