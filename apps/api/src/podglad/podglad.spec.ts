import { readFileSync } from 'fs';
import { createServer, request as httpRequest, type Server } from 'http';
import { join } from 'path';
import { gunzipSync, gzipSync } from 'zlib';
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
  let ostatnieCiastka = '';
  let polaczen = 0;
  const konto = { domain: 'sklep.pl', status: 'ACTIVE', server: { ipAddress: '127.0.0.1' } };

  beforeAll(async () => {
    process.env.PODGLAD_DOMENA = 'podglad.test';
    wezel = createServer((req, res) => {
      polaczen += 1;
      ostatniHost = String(req.headers.host);
      ostatnieCiastka = String(req.headers.cookie ?? '');
      if (req.url === '/przekieruj') {
        res.writeHead(301, { location: 'https://sklep.pl/nowe', server: 'LiteSpeed' });
        return res.end();
      }
      if (req.url === '/do-panelu') {
        res.writeHead(302, { location: 'https://srv7.wezly.example:2222/CMD_LOGIN' });
        return res.end();
      }
      if (req.url === '/cp1250') {
        res.writeHead(200, { 'content-type': 'text/html; charset=windows-1250' });
        return res.end(Buffer.concat([Buffer.from('<body><a href="https://sklep.pl/">'), Buffer.from([0xb9, 0x9c]), Buffer.from('</a></body>')]));
      }
      if (req.url === '/gzip') {
        res.writeHead(200, { 'content-type': 'text/html', 'content-encoding': 'gzip' });
        return res.end(gzipSync('<a href="https://sklep.pl/">x</a>'));
      }
      if (req.url === '/wolno') {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        const t = setInterval(() => res.write('x'), 100);
        setTimeout(() => { clearInterval(t); res.end(); }, 3000);
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'set-cookie': 'a=1; Domain=sklep.pl; Path=/',
        server: 'LiteSpeed',
        'x-litespeed-cache': 'hit',
        'x-turbo-charged-by': 'LiteSpeed',
        link: '<https://sklep.pl/wp-json/>; rel="https://api.w.org/"',
      });
      res.end('<html><body class="home"><a href="https://sklep.pl/o-nas">O nas</a></body></html>');
    });
    await new Promise<void>((r) => wezel.listen(0, '127.0.0.1', r));
    const prisma = { account: { findUnique: vi.fn(async () => konto) }, subscription: { findFirst: vi.fn(async () => ({ account: { id: KONTO, domain: 'sklep.pl', status: 'ACTIVE' } })) } };
    svc = new PodgladService(prisma as never, { get: () => KLUCZ } as never);
    // https na zamkniętym porcie → fallback na http (port węzła testowego).
    svc.porty = { https: 1, http: (wezel.address() as AddressInfo).port };
    svc.maksCzasMs = 600;
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

  type Odp = { status: number; headers: { get(n: string): string | null }; body: Buffer; text(): Promise<string>; ms: number };
  // fetch (undici) nie pozwala ustawić nagłówka Host — zwykłe http.request.
  const pobierz = (host: string, sciezka = '/', metoda = 'GET', cookie?: string) =>
    new Promise<Odp>((ok) => {
      const start = Date.now();
      const r = httpRequest(
        { host: '127.0.0.1', port: apiPort, path: `/podglad-proxy${sciezka}`, method: metoda, headers: { host, ...(cookie ? { cookie } : {}) } },
        (odp) => {
          const kaw: Buffer[] = [];
          const koniec = () => {
            const body = Buffer.concat(kaw);
            ok({
              status: odp.statusCode ?? 0,
              headers: { get: (n) => { const v = odp.headers[n.toLowerCase()]; return v === undefined ? null : Array.isArray(v) ? v.join(', ') : String(v); } },
              body,
              text: async () => body.toString('utf8'),
              ms: Date.now() - start,
            });
          };
          odp.on('data', (k: Buffer) => kaw.push(k));
          odp.on('end', koniec);
          odp.on('error', koniec);
          odp.on('aborted', koniec);
        },
      );
      r.on('error', () => ok({ status: -1, headers: { get: () => null }, body: Buffer.alloc(0), text: async () => '', ms: Date.now() - start }));
      r.end();
    });

  /** Link z panelu → ciasteczko dostępu (jak przeglądarka po kliknięciu). */
  const wejdz = async () => {
    const { url } = await svc.adresDlaKlienta('s1', 'u1');
    const u = new URL(url);
    const w = await pobierz(u.host, u.pathname + u.search);
    expect(w.status).toBe(302);
    expect(w.headers.get('location')).toBe('/');
    const setCookie = w.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/^verris_podglad=[0-9a-f]{32}; Path=\/; Max-Age=\d+; Secure; HttpOnly; SameSite=Lax$/);
    expect(setCookie).not.toMatch(/domain=/i);
    return { host: u.host, cookie: setCookie.split(';')[0] };
  };

  it('adres dla klienta: https://<etykieta>.<domena podglądu>/__verris_podglad?k=… bez adresu węzła', async () => {
    const a = await svc.adresDlaKlienta('s1', 'u1');
    expect(a.url).toMatch(/^https:\/\/p[0-9a-z]+\.podglad\.test\/__verris_podglad\?k=[0-9a-f]{32}$/);
    expect(a.url).not.toContain('127.0.0.1');
  });

  // Noc 15.10 (przegląd): każda nazwa hosta trafia do publicznych logów CT — sama etykieta nie może dawać dostępu.
  it('sama etykieta z logów CT (bez klucza z linku) → 403 bez łączenia z węzłem; zły klucz → 403', async () => {
    const { url } = await svc.adresDlaKlienta('s1', 'u1');
    const host = new URL(url).host;
    const przed = polaczen;
    expect((await pobierz(host, '/')).status).toBe(403);
    expect((await pobierz(host, `/__verris_podglad?k=${'0'.repeat(32)}`)).status).toBe(403);
    expect((await pobierz(host, '/', 'GET', `verris_podglad=${'0'.repeat(32)}`)).status).toBe(403);
    expect(polaczen).toBe(przed);
  });

  it('ten sam adres przez cały tydzień (jeden certyfikat na konto na tydzień, limit Let\'s Encrypt)', async () => {
    const a = await svc.adresDlaKlienta('s1', 'u1');
    await new Promise((r) => setTimeout(r, 1100));
    const b = await svc.adresDlaKlienta('s1', 'u1');
    expect(b.url).toBe(a.url);
    const dni = (new Date(a.wygasa).getTime() - Date.now()) / 86400000;
    expect(dni).toBeGreaterThan(6.9);
    expect(dni).toBeLessThanOrEqual(14);
  });

  it('z ciasteczkiem: treść z węzła (Host = domena), adresy przepisane, pasek „podgląd”, bez nagłówków serwera', async () => {
    const { host, cookie } = await wejdz();
    const r = await pobierz(host, '/', 'GET', `${cookie}; wp_x=7`);
    expect(r.status).toBe(200);
    expect(ostatniHost).toBe('sklep.pl');
    expect(ostatnieCiastka).toBe('wp_x=7'); // nasze ciasteczko dostępu nie idzie do węzła klienta
    const html = await r.text();
    expect(html).toContain(`<a href="https://${host}/o-nas">O nas</a>`);
    expect(html).toMatch(/<body class="home"><div data-verris-podglad[^>]*>Podgl&#261;d strony sklep\.pl przed zmian&#261; DNS/);
    expect(r.headers.get('set-cookie')).toBe('a=1; Path=/');
    for (const n of ['server', 'x-litespeed-cache', 'x-turbo-charged-by', 'link']) expect(r.headers.get(n)).toBeNull();
    expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(r.headers.get('x-frame-options')).toBe('SAMEORIGIN');
  });

  it('przekierowanie w obrębie strony → względne; na inny host (np. panel serwera) → 502 bez adresu', async () => {
    const { host, cookie } = await wejdz();
    const p = await pobierz(host, '/przekieruj', 'GET', cookie);
    expect(p.status).toBe(301);
    expect(p.headers.get('location')).toBe('/nowe');
    const z = await pobierz(host, '/do-panelu', 'GET', cookie);
    expect(z.status).toBe(502);
    expect(z.headers.get('location')).toBeNull();
    expect(await z.text()).not.toMatch(/wezly|2222/);
  });

  it('kodowanie strony inne niż UTF-8 zostaje bajt w bajt; gzip z węzła przechodzi bez podmiany z nagłówkiem', async () => {
    const { host, cookie } = await wejdz();
    const c = await pobierz(host, '/cp1250', 'GET', cookie);
    expect(c.body.includes(Buffer.from([0xb9, 0x9c]))).toBe(true);
    expect(c.body.toString('latin1')).toContain(`href="https://${host}/"`);
    const g = await pobierz(host, '/gzip', 'GET', cookie);
    expect(g.headers.get('content-encoding')).toBe('gzip');
    expect(gunzipSync(g.body).toString()).toBe('<a href="https://sklep.pl/">x</a>');
  });

  it('węzeł wysyłający po bajcie nie trzyma procesu API dłużej niż limit całego żądania', async () => {
    const { host, cookie } = await wejdz();
    const r = await pobierz(host, '/wolno', 'GET', cookie);
    expect(r.ms).toBeLessThan(2000);
  });

  it('zły albo wygasły token → 404 bez łączenia z węzłem; POST → 405', async () => {
    ostatniHost = '';
    expect((await pobierz('pzzzzzzz' + '0'.repeat(48) + '.podglad.test')).status).toBe(404);
    expect((await pobierz('cokolwiek.verris.pl')).status).toBe(404);
    expect(ostatniHost).toBe('');
    const { host, cookie } = await wejdz();
    expect((await pobierz(host, '/', 'POST', cookie)).status).toBe(405);
  });

  it('domena podglądu pod verris.pl jest odrzucana (wspólne ciasteczka z panelami)', () => {
    process.env.PODGLAD_DOMENA = 'podglad.verris.pl';
    expect(svc.domena()).toBeNull();
    process.env.PODGLAD_DOMENA = 'podglad.test';
  });

  it('Caddy: ścieżki podglądu ucięte na adresie API także z „/” na końcu', () => {
    const caddy = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'caddy', 'Caddyfile'), 'utf8');
    expect(caddy).toMatch(/@podglad_z_api path \/podglad\/tls-check\* \/podglad-proxy\*/);
  });
});
