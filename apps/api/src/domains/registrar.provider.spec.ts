import { RegistrarProviderFactory, stanOpenProvider } from './registrar.provider.js';

/** 27.09 — wyszukiwarka pokazywała same „zajęte”: OpenProvider zwraca wyniki w innej kolejności niż zapytanie. */
describe('OpenProvider — sprawdzanie dostępności', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H',
  };
  const provider = () => new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get();
  afterEach(() => vi.unstubAllGlobals());

  it('dopasowanie po nazwie domeny, paczki po 15, jedno logowanie', async () => {
    const zapytania: string[][] = [];
    const fetchMock = vi.fn(async (url: string, init: { body: string }) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      const domeny = (JSON.parse(init.body).domains as { name: string; extension: string }[]).map((d) => `${d.name}.${d.extension}`);
      zapytania.push(domeny);
      // odwrócona kolejność; .com zajęta
      const results = [...domeny].reverse().map((d) => ({
        domain: d, status: d.endsWith('.com') ? 'active' : 'free', price: { reseller: { price: 4.08, currency: 'USD' } },
      }));
      return new Response(JSON.stringify({ code: 0, data: { results } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const ext = Array.from({ length: 20 }, (_, i) => (i === 1 ? 'com' : `t${i}`));
    const wynik = await provider().batchAvailability('nazwa', ext);
    expect(zapytania.map((z) => z.length)).toEqual([15, 5]);
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/auth/login'))).toHaveLength(1);
    expect(wynik.map((w) => [w.domain, w.available])).toEqual(ext.map((e) => [`nazwa.${e}`, e !== 'com']));
    expect(wynik[0].priceAmount).toBe('4.08');
  });
});

describe('OpenProvider — stan domeny (domknięcie transferu)', () => {
  it('ACT = aktywna, FAI/DEL = nieudana, reszta i nieznane = w toku (bez zwrotu za udany transfer)', () => {
    expect(stanOpenProvider('ACT')).toBe('active');
    expect(stanOpenProvider('fai')).toBe('failed');
    expect(stanOpenProvider('DEL')).toBe('failed');
    for (const k of ['REQ', 'PEN', 'SCH', 'XYZ']) expect(stanOpenProvider(k)).toBe('pending');
    expect(stanOpenProvider(undefined)).toBeNull();
  });
});
