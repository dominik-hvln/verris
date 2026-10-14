import { createServer, request as httpRequest, type Server } from 'http';
import type { AddressInfo } from 'net';
import express from 'express';
import { PodgladService } from './podglad.service.js';
import { sprawdzTokenPodgladu, utworzTokenPodgladu } from './podglad-token.js';
import { przepiszAdresy, przepiszCookie } from './podglad-przepisz.js';

/**
 * 15.10 — podgląd strony przed zmianą DNS (decyzja 14.10: zespół i klient widzą stronę na tymczasowym adresie).
 * White label: adres `<token>.<PODGLAD_DOMENA>`, nigdy adres węzła; treść z węzła konta, adresy domeny podmienione.
 */
const KLUCZ = 'k'.repeat(40);
const KONTO = '0c11af1c-aaaa-4bbb-bccc-cdddddddeeee';

describe('token podglądu', () => {
  it('jedna etykieta DNS (≤ 63, [a-z0-9]), ważny do terminu, podpis nie do podrobienia', () => {
    const wygasa = new Date(Date.now() + 3600_000);
    const t = utworzTokenPodgladu(KLUCZ, KONTO, wygasa);
    expect(t).toMatch(/^[a-z0-9]{1,63}$/);
    expect(sprawdzTokenPodgladu(KLUCZ, t)).toEqual({ accountId: KONTO, wygasa: new Date(Math.floor(wygasa.getTime() / 1000) * 1000) });
    expect(sprawdzTokenPodgladu('inny-klucz'.repeat(4), t)).toBeNull();
    const podmienione = t.slice(0, 9) + (t[9] === 'a' ? 'b' : 'a') + t.slice(10);
    expect(sprawdzTokenPodgladu(KLUCZ, podmienione)).toBeNull();
    expect(sprawdzTokenPodgladu(KLUCZ, t, new Date(wygasa.getTime() + 1000))).toBeNull();
  });
});

describe('podmiana adresów', () => {
  it('domena i www na adres podglądu (zwykłe i w JSON), inne hosty bez zmian', () => {
    const t = przepiszAdresy(
      '<a href="https://sklep.pl/koszyk">x</a><img src="//www.sklep.pl/a.png"><script>var u="https:\\/\\/sklep.pl\\/wp-json"</script>' +
        '<link href="https://cdn.sklep.pl/s.css"><a href="https://sklep.pl.evil.com/">z</a>',
      'sklep.pl',
      'p1.podglad.test',
    );
    expect(t).toContain('href="https://p1.podglad.test/koszyk"');
    expect(t).toContain('src="https://p1.podglad.test/a.png"');
    expect(t).toContain('"https:\\/\\/p1.podglad.test\\/wp-json"');
    expect(t).toContain('https://cdn.sklep.pl/s.css');
    expect(t).toContain('https://sklep.pl.evil.com/');
  });

  it('ciasteczka bez atrybutu Domain', () => {
    expect(przepiszCookie('wp_x=1; Path=/; Domain=.sklep.pl; Secure; HttpOnly')).toBe('wp_x=1; Path=/; Secure; HttpOnly');
  });
});

describe('PodgladService — przez proxy do węzła konta', () => {
  let wezel: Server;
  let api: Server;
  let svc: PodgladService;
  let apiPort: number;
  let ostatniHost = '';
  const konto = { domain: 'sklep.pl', status: 'ACTIVE', server: { ipAddress: '127.0.0.1' } };

  beforeAll(async () => {
    process.env.PODGLAD_DOMENA = 'podglad.test';
    wezel = createServer((req, res) => {
      ostatniHost = String(req.headers.host);
      if (req.url === '/przekieruj') {
        res.writeHead(301, { location: 'https://sklep.pl/nowe', server: 'LiteSpeed' });
        return res.end();
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'a=1; Domain=sklep.pl; Path=/', server: 'LiteSpeed' });
      res.end('<a href="https://sklep.pl/o-nas">O nas</a>');
    });
    await new Promise<void>((r) => wezel.listen(0, '127.0.0.1', r));
    const prisma = { account: { findUnique: vi.fn(async () => konto) }, subscription: { findFirst: vi.fn(async () => ({ account: { id: KONTO, domain: 'sklep.pl', status: 'ACTIVE' } })) } };
    svc = new PodgladService(prisma as never, { get: () => KLUCZ } as never);
    // https na zamkniętym porcie → fallback na http (port węzła testowego).
    svc.porty = { https: 1, http: (wezel.address() as AddressInfo).port };
    const app = express();
    app.all(['/podglad-proxy', '/podglad-proxy/*sciezka'], (req, res) => {
      void svc.proxy(req, res, req.originalUrl.replace(/^\/podglad-proxy/, '') || '/');
    });
    api = app.listen(0, '127.0.0.1');
    await new Promise((r) => api.once('listening', r));
    apiPort = (api.address() as AddressInfo).port;
  });
  afterAll(() => {
    wezel.close();
    api.close();
    delete process.env.PODGLAD_DOMENA;
  });

  // fetch (undici) nie pozwala ustawić nagłówka Host — zwykłe http.request.
  const pobierz = (host: string, sciezka = '/', metoda = 'GET') =>
    new Promise<{ status: number; headers: { get(n: string): string | null }; text(): Promise<string> }>((ok, blad) => {
      const r = httpRequest({ host: '127.0.0.1', port: apiPort, path: `/podglad-proxy${sciezka}`, method: metoda, headers: { host } }, (odp) => {
        const kaw: Buffer[] = [];
        odp.on('data', (k: Buffer) => kaw.push(k));
        odp.on('end', () =>
          ok({
            status: odp.statusCode ?? 0,
            headers: { get: (n) => { const v = odp.headers[n.toLowerCase()]; return v === undefined ? null : Array.isArray(v) ? v.join(', ') : String(v); } },
            text: async () => Buffer.concat(kaw).toString('utf8'),
          }),
        );
      });
      r.on('error', blad);
      r.end();
    });

  it('adres dla klienta: https://<token>.<domena podglądu>/ bez adresu węzła', async () => {
    const a = await svc.adresDlaKlienta('s1', 'u1');
    expect(a.url).toMatch(/^https:\/\/p[0-9a-z]+\.podglad\.test\/$/);
    expect(a.url).not.toContain('127.0.0.1');
  });

  it('ważny token: treść z węzła z Host = domena klienta, adresy i ciasteczka przepisane, bez nagłówka serwera', async () => {
    const { url } = await svc.adresDlaKlienta('s1', 'u1');
    const host = new URL(url).host;
    const r = await pobierz(host, '/');
    expect(r.status).toBe(200);
    expect(ostatniHost).toBe('sklep.pl');
    expect(await r.text()).toBe(`<a href="https://${host}/o-nas">O nas</a>`);
    expect(r.headers.get('set-cookie')).toBe('a=1; Path=/');
    expect(r.headers.get('server')).toBeNull();
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const p = await pobierz(host, '/przekieruj');
    expect(p.status).toBe(301);
    expect(p.headers.get('location')).toBe(`https://${host}/nowe`);
  });

  it('zły albo wygasły token → 404 bez łączenia z węzłem; POST → 405', async () => {
    ostatniHost = '';
    expect((await pobierz('pzzzzzzz' + '0'.repeat(48) + '.podglad.test')).status).toBe(404);
    expect((await pobierz('cokolwiek.verris.pl')).status).toBe(404);
    expect(ostatniHost).toBe('');
    const { url } = await svc.adresDlaKlienta('s1', 'u1');
    expect((await pobierz(new URL(url).host, '/', 'POST')).status).toBe(405);
  });

  it('domena podglądu pod verris.pl jest odrzucana (wspólne ciasteczka z panelami)', () => {
    process.env.PODGLAD_DOMENA = 'podglad.verris.pl';
    expect(svc.domena()).toBeNull();
    process.env.PODGLAD_DOMENA = 'podglad.test';
  });
});
