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

describe('OpenProvider — zawieszona paczka (t1 04.10, sandbox: 504 po ~60 s)', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H',
  };
  afterEach(() => vi.unstubAllGlobals());

  it('paczki idą równolegle z limitem czasu — wiszące zapytanie nie blokuje pozostałych końcówek', async () => {
    const sygnaly: (AbortSignal | undefined)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string; signal?: AbortSignal }) => {
      sygnaly.push(init.signal);
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      const domeny = (JSON.parse(init.body).domains as { name: string; extension: string }[]).map((d) => `${d.name}.${d.extension}`);
      if (domeny.includes('nazwa.t0') && domeny.length > 1) {
        // pierwsza paczka „wisi”, dopóki sygnał nie przerwie — jak rejestr bez środowiska testowego
        return new Promise<Response>((_, rej) => init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('t'), { name: 'TimeoutError' }))));
      }
      return new Response(JSON.stringify({ code: 0, data: { results: domeny.map((d) => ({ domain: d, status: 'free' })) } }));
    }));
    const ext = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const p = new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get().batchAvailability('nazwa', ext);
    // druga paczka odpowiedziała mimo wiszącej pierwszej
    await vi.waitFor(() => expect(sygnaly.length).toBe(3));
    expect(sygnaly.every(Boolean)).toBe(true);
    // limit czasu (AbortSignal.timeout) przerywa wiszącą paczkę
    sygnaly[1]!.dispatchEvent(new Event('abort'));
    const wynik = await p;
    // po przerwaniu paczki jej domeny poszły pojedynczo — dostępne wszystkie 20
    expect(wynik.filter((w) => w.available)).toHaveLength(20);
  });

  it('paczka przerwana → jej domeny pojedynczo; wisi tylko jedna końcówka, reszta paczki ma wynik', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { body: string; signal?: AbortSignal }) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      const domeny = (JSON.parse(init.body).domains as { name: string; extension: string }[]).map((d) => `${d.name}.${d.extension}`);
      if (domeny.includes('nazwa.online')) return new Response('{}', { status: 504 });
      return new Response(JSON.stringify({ code: 0, data: { results: domeny.map((d) => ({ domain: d, status: 'free' })) } }));
    }));
    const wynik = await new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get().batchAvailability('nazwa', ['pl', 'online', 'com']);
    expect(wynik.map((w) => [w.domain, w.available, w.unknown])).toEqual([['nazwa.pl', true, false], ['nazwa.online', false, true], ['nazwa.com', true, false]]);
  });
});

describe('OpenProvider — odnowienie (t1 04.10: brak expiration_date w odpowiedzi)', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H',
  };
  afterEach(() => vi.unstubAllGlobals());
  it('nowa data ważności z domeny u rejestratora, gdy renew jej nie zwraca', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      if (url.endsWith('/renew')) return new Response(JSON.stringify({ code: 0, data: { status: 'ACT' } }));
      return new Response(JSON.stringify({ code: 0, data: { status: 'ACT', expiration_date: '2028-10-04 12:00:00' } }));
    }));
    const r = await new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get().renew({ domain: 'a.com', years: 1, externalId: '123' });
    expect(r.expiresAt).toBe('2028-10-04 12:00:00');
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

describe('OpenProvider — błąd z przyczyną w `data` (D3 06.10: zamówienie SSL, „…see the details below:” bez szczegółów)', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H',
  };
  afterEach(() => vi.unstubAllGlobals());
  it('komunikat wyjątku zawiera desc i szczegóły z data', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      return new Response(
        JSON.stringify({ code: 399, desc: 'An unknown error occurred; for more information, see the details below:', data: 'Invalid CSR: key too short' }),
        { status: 500 },
      );
    }));
    const p = new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get() as unknown as {
      sslCreateOrder: (i: unknown) => Promise<string>;
    };
    await expect(p.sslCreateOrder({ productId: 1, years: 1, csr: 'x', hostName: 'a.pl', validation: 'dns' })).rejects.toThrow(
      /see the details below: Invalid CSR: key too short/,
    );
  });
});

describe('OpenProvider — szczegóły błędu poza `data`', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H',
  };
  afterEach(() => vi.unstubAllGlobals());
  it('warnings trafiają do komunikatu, gdy data brak', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      return new Response(JSON.stringify({ code: 399, desc: 'An unknown error occurred', warnings: [{ code: 1, desc: 'Handle has no organization' }] }), { status: 500 });
    }));
    const p = new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get() as unknown as {
      sslCreateOrder: (i: unknown) => Promise<string>;
    };
    await expect(p.sslCreateOrder({ productId: 1, years: 1, csr: 'x', hostName: 'a.pl', validation: 'dns' })).rejects.toThrow(/Handle has no organization/);
  });
});

describe('OpenProvider — zmiana serwerów nazw', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H',
  };
  afterEach(() => vi.unstubAllGlobals());
  it('PUT /v1/domains/{id} z name_servers w formacie rejestracji', async () => {
    const fetchMock = vi.fn(async (url: string, _init: { method?: string; body: string }) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      return new Response(JSON.stringify({ code: 0, data: { status: 'ACT' } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get().setNameservers('42', ['ns3.verris.pl', 'ns4.verris.pl']);
    const [url, init] = fetchMock.mock.calls.find((c) => String(c[0]).includes('/v1/domains/'))!;
    expect(url).toMatch(/\/v1\/domains\/42$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ name_servers: [{ name: 'ns3.verris.pl' }, { name: 'ns4.verris.pl' }] });
  });
});
