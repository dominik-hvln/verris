import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { AnalyticsPublicController } from './analytics-public.controller.js';
import { ipv6NaLiczbe, krajDlaIp, liczbaZakresow, zbudujTablice } from './geoip-dbip.js';
import { GeoIpService, MIN_ZAKRESOW, adresPlikuDbip } from './geoip.service.js';

/** Decyzja 15.10 (#16) — kraj odwiedzającego z DB-IP Lite (CSV: ip_od,ip_do,kraj), bez zapisu adresu IP. */
const CSV = [
  '1.0.0.0,1.0.0.255,AU',
  '"5.172.0.0","5.172.255.255","PL"',
  '8.8.8.0,8.8.8.255,US',
  '10.0.0.0,10.255.255.255,ZZ',
  '2001:4860::,2001:4860:ffff:ffff:ffff:ffff:ffff:ffff,US',
  '2a01:110::,2a01:110:ffff:ffff:ffff:ffff:ffff:ffff,PL',
  'śmieci',
].join('\n');

describe('DB-IP Lite — tablica krajów', () => {
  const t = zbudujTablice(CSV);

  it('IPv4, IPv6, IPv4 zapisany jako IPv6; poza zakresem, „ZZ” i bzdury → null', () => {
    expect(krajDlaIp(t, '5.172.10.20')).toBe('PL');
    expect(krajDlaIp(t, '8.8.8.8')).toBe('US');
    expect(krajDlaIp(t, '1.0.0.255')).toBe('AU');
    expect(krajDlaIp(t, '::ffff:5.172.1.1')).toBe('PL');
    expect(krajDlaIp(t, '2001:4860:4860::8888')).toBe('US');
    expect(krajDlaIp(t, '2a01:110:8012:1010::1')).toBe('PL');
    expect(krajDlaIp(t, '9.9.9.9')).toBeNull();
    expect(krajDlaIp(t, '10.1.2.3')).toBeNull();
    expect(krajDlaIp(t, 'nie-ip')).toBeNull();
    expect(liczbaZakresow(t)).toBe(5);
  });

  it('parser IPv6: skróty i niepoprawne adresy', () => {
    expect(ipv6NaLiczbe('::1')).toEqual([0n, 1n]);
    expect(ipv6NaLiczbe('2001:db8::')).toEqual([0x20010db800000000n, 0n]);
    expect(ipv6NaLiczbe('1::2::3')).toBeNull();
    expect(ipv6NaLiczbe('12345::')).toBeNull();
  });
});

describe('GeoIpService — pobranie miesięcznego pliku', () => {
  const katalog = mkdtempSync(join(tmpdir(), 'geoip-test-'));
  afterAll(() => rmSync(katalog, { recursive: true, force: true }));
  afterEach(() => vi.unstubAllGlobals());

  /** Pełny plik: wiersze z CSV + MIN_ZAKRESOW kolejnych sieci /24 od 21.0.0.0 (PL). */
  const pelny = () => {
    const w: string[] = [CSV];
    for (let i = 0; i < MIN_ZAKRESOW; i++) {
      const siec = `${21 + (i >> 16)}.${(i >> 8) & 255}.${i & 255}`;
      w.push(`${siec}.0,${siec}.255,PL`);
    }
    return gzipSync(Buffer.from(w.join('\n')));
  };

  it('nowego pliku jeszcze nie ma (404) → poprzedni miesiąc; zapis do pamięci podręcznej; kraj z bazy', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === adresPlikuDbip(new Date(Date.UTC(2026, 9, 1)))
        ? new Response(pelny(), { status: 200 })
        : new Response('brak', { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const s = new GeoIpService({ get: (k: string) => (k === 'GEOIP_KATALOG' ? katalog : undefined) } as never);
    expect(s.kraj('5.172.10.20')).toBeNull();
    expect(await s.odswiez(new Date(Date.UTC(2026, 10, 2)))).toBeGreaterThanOrEqual(MIN_ZAKRESOW);
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      'https://download.db-ip.com/free/dbip-country-lite-2026-11.csv.gz',
      'https://download.db-ip.com/free/dbip-country-lite-2026-10.csv.gz',
    ]);
    expect(s.kraj('5.172.10.20')).toBe('PL');
    expect(readdirSync(katalog)).toEqual(['dbip-country-lite-2026-10.csv.gz']);

    // Restart API: plik z dysku, bez pobierania.
    const s2 = new GeoIpService({ get: (k: string) => (k === 'GEOIP_KATALOG' ? katalog : undefined) } as never);
    fetchMock.mockClear();
    await s2.odswiez(new Date(Date.UTC(2026, 9, 15)));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(s2.kraj('8.8.8.8')).toBe('US');
  });

  it('obcięty plik (za mało zakresów) nie podmienia bazy; GEOIP_DBIP=0 — nic nie pobiera', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(gzipSync(Buffer.from(CSV)), { status: 200 })));
    const s = new GeoIpService({ get: (k: string) => (k === 'GEOIP_KATALOG' ? mkdtempSync(join(tmpdir(), 'geoip-x-')) : undefined) } as never);
    expect(await s.odswiez(new Date(Date.UTC(2026, 9, 15)))).toBeNull();
    expect(s.kraj('5.172.10.20')).toBeNull();

    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await new GeoIpService({ get: (k: string) => (k === 'GEOIP_DBIP' ? '0' : undefined) } as never).odswiez()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('POST /analytics/collect — kraj', () => {
  const zbieraj = (geo: string | null) => {
    const collect = vi.fn(async () => undefined);
    const c = new AnalyticsPublicController({ collect } as never, { kraj: vi.fn(() => geo) } as never);
    return { c, collect };
  };

  it('bez nagłówka geo z proxy — kraj z bazy DB-IP; nagłówek proxy ma pierwszeństwo', async () => {
    const a = zbieraj('PL');
    await a.c.collect({ k: 'site', p: '/' }, '5.172.10.20', 'UA');
    expect(a.collect).toHaveBeenCalledWith(expect.objectContaining({ country: 'PL' }));
    const b = zbieraj('PL');
    await b.c.collect({ k: 'site', p: '/' }, '5.172.10.20', 'UA', 'DE');
    expect(b.collect).toHaveBeenCalledWith(expect.objectContaining({ country: 'DE' }));
  });
});
