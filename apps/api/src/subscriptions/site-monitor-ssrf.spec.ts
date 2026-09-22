import { probeUrl } from './site-monitor.service';

/**
 * SEC-09 (druga warstwa) — monitor strony nie odpytuje adresów prywatnych,
 * nawet gdy domena klienta na nie wskazuje, i nie idzie za przekierowaniem.
 */
describe('monitor strony a SSRF', () => {
  const fetchOryginalny = global.fetch;
  let wywolania: Array<[string, RequestInit | undefined]>;

  beforeEach(() => {
    wywolania = [];
    global.fetch = jest.fn(async (u: string | URL | Request, o?: RequestInit) => {
      wywolania.push([String(u), o]);
      return new Response(null, { status: 301 });
    }) as typeof fetch;
  });
  afterEach(() => {
    global.fetch = fetchOryginalny;
  });

  it.each(['169.254.169.254', '127.0.0.1', '10.1.2.3', '172.19.0.3', '192.168.1.1'])(
    'adres %s: DOWN bez wysłania żądania',
    async (ip) => {
      const r = await probeUrl(`https://${ip}`);
      expect(r.up).toBe(false);
      expect(r.reason).toMatch(/prywatny/);
      expect(wywolania).toHaveLength(0);
    },
  );

  it('adres publiczny: jedno żądanie, bez podążania za przekierowaniem, 3xx = UP', async () => {
    const r = await probeUrl('https://1.1.1.1');
    expect(r.up).toBe(true);
    expect(wywolania).toHaveLength(1);
    expect(wywolania[0][1]?.redirect).toBe('manual');
  });
});
