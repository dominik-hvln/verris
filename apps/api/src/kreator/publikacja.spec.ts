import { NotFoundException } from '@nestjs/common';
import {
  BladPlikowPublikacji,
  bladSciezki,
  katalogiPlikow,
  nazwaKopii,
  obceWpisy,
  odczytajZnacznik,
  osierocone,
  skrotySkryptow,
  sprawdzPliki,
  tylkoZaslepka,
  wKolejce,
  wstawPasekProby,
  zbudujZnacznik,
  PASEK_PROBY,
} from './publikacja.js';
import { sprawdzTokenLinku, utworzTokenLinku } from './publikacja-token.js';
import { PlikiHostinguDa } from './pliki-hostingu.js';
import { KreatorLinkController } from './kreator-link.controller.js';
import { nazwaZip } from './zip-strony.js';

const ID = '11111111-2222-4333-8444-555555555555';
const plik = (sciezka: string, bajty = 1) => ({ sciezka, dane: Buffer.alloc(bajty), tekst: true });

describe('publikacja – ścieżki z renderu', () => {
  it.each(['index.html', 'o-nas/index.html', 'blog/wpis-1/index.html', 'assets/fonty/inter-400-latin-ext.woff2', 'robots.txt', '404.html'])('dozwolona: %s', (s) => {
    expect(bladSciezki(s)).toBeNull();
  });

  it.each(['', '/index.html', '../x', 'a/../../b', 'a//b', './a', '.htaccess', 'a/.git/config', 'A.html', 'a b.html', 'a\\b', 'x.php?y', 'a/b/c/d/e/f.html', `${'a'.repeat(81)}.html`, 'ą.html', 'a_b.html'])(
    'odrzucona: %j',
    (s) => {
      expect(bladSciezki(s)).not.toBeNull();
    },
  );

  it('komplet: duplikaty, plik i katalog o tej samej nazwie, limit liczby i rozmiaru', () => {
    expect(() => sprawdzPliki([plik('index.html'), plik('index.html')])).toThrow(BladPlikowPublikacji);
    expect(() => sprawdzPliki([plik('o-nas'), plik('o-nas/index.html')])).toThrow(/tej samej nazwie/);
    expect(() => sprawdzPliki(Array.from({ length: 401 }, (_, i) => plik(`p${i}.html`)))).toThrow(/za dużo plików/);
    expect(() => sprawdzPliki([plik('a.html', 20 * 1024 * 1024 + 1)])).toThrow(/za duża/);
    expect(() => sprawdzPliki([plik('index.html'), plik('assets/styl.css')])).not.toThrow();
  });

  it('katalogi do utworzenia – rodzice przed dziećmi, bez powtórzeń', () => {
    expect(katalogiPlikow(['index.html', 'assets/fonty/a.woff2', 'assets/styl.css', 'blog/x/index.html'])).toEqual(['assets', 'blog', 'assets/fonty', 'blog/x']);
  });

  it('osierocone pliki pogrupowane po katalogu', () => {
    const o = osierocone(['index.html', 'o-nas/index.html', 'assets/a.css', 'assets/b.css'], ['index.html', 'assets/a.css']);
    expect([...o.entries()]).toEqual([['o-nas', ['index.html']], ['assets', ['b.css']]]);
  });
});

describe('publikacja – znacznik i zawartość katalogu', () => {
  it('znacznik: zapis i odczyt; podejrzana lista plików (ścieżki poza katalogiem) = brak znacznika', () => {
    const z = odczytajZnacznik(zbudujZnacznik(ID, ['b.html', 'a.html', 'a.html'], true));
    expect(z).toMatchObject({ stronaId: ID, pliki: ['a.html', 'b.html'], wToku: true });
    expect(odczytajZnacznik(JSON.stringify({ stronaId: ID, pliki: ['../../.ssh/authorized_keys'] }))).toBeNull();
    expect(odczytajZnacznik(JSON.stringify({ stronaId: 'x', pliki: [] }))).toBeNull();
    expect(odczytajZnacznik('nie json')).toBeNull();
    expect(odczytajZnacznik(null)).toBeNull();
  });

  it('cudze wpisy: bez .well-known, cgi-bin, znacznika, kopii, poddomen i – dla tej strony – plików ze znacznika', () => {
    const wpisy = [
      { name: '.well-known', type: 'dir' as const },
      { name: 'cgi-bin', type: 'dir' as const },
      { name: '.verris-kreator.json', type: 'file' as const },
      { name: '.verris-kopia-20261107-1200', type: 'dir' as const },
      { name: 'sklep', type: 'dir' as const },
      { name: 'index.html', type: 'file' as const },
      { name: 'assets', type: 'dir' as const },
      { name: 'wp-login.php', type: 'file' as const },
    ];
    const z = { stronaId: ID, pliki: ['index.html', 'assets/styl.css'], at: '' };
    expect(obceWpisy(wpisy, z, ID, ['Sklep']).map((w) => w.name)).toEqual(['wp-login.php']);
    expect(obceWpisy(wpisy, z, '00000000-0000-4000-8000-000000000000', ['sklep']).map((w) => w.name)).toEqual(['index.html', 'assets', 'wp-login.php']);
  });

  it('zaślepka nowej domeny rozpoznana tylko z treścią strony powitalnej i grafikami Verris', () => {
    const idx = { name: 'index.html', type: 'file' as const };
    const as = { name: 'assets', type: 'dir' as const };
    const svg = [{ name: 'verris-mark-dark.svg', type: 'file' as const }];
    expect(tylkoZaslepka([idx], '<h1>Witamy na stronie x.pl</h1> Hosting Verris', null)).toBe(true);
    expect(tylkoZaslepka([idx, as], '<h1>Witamy na stronie x.pl</h1> Hosting Verris', svg)).toBe(true);
    expect(tylkoZaslepka([idx], 'Something amazing will be constructed here', null)).toBe(true);
    expect(tylkoZaslepka([idx], '<h1>Moja firma</h1>', null)).toBe(false);
    expect(tylkoZaslepka([idx, as], 'Witamy na stronie x Hosting Verris', [{ name: 'app.js', type: 'file' }])).toBe(false);
    expect(tylkoZaslepka([idx, { name: 'wp-config.php', type: 'file' }], 'Witamy na stronie Hosting Verris', null)).toBe(false);
  });

  it('nazwa kopii w czasie polskim', () => {
    expect(nazwaKopii(new Date('2026-11-07T19:05:00Z'))).toBe('.verris-kopia-20261107-2005');
    expect(nazwaKopii(new Date('2026-07-01T22:30:00Z'))).toBe('.verris-kopia-20260702-0030');
  });
});

describe('publikacja – kolejka z limitem równoległości', () => {
  it('najwyżej `limit` naraz; pierwszy błąd zatrzymuje kolejne zadania', async () => {
    let naraz = 0;
    let maks = 0;
    const wykonane: number[] = [];
    const e = await wKolejce([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 3, async (n) => {
      naraz++;
      maks = Math.max(maks, naraz);
      await new Promise((r) => setTimeout(r, 2));
      naraz--;
      if (n === 2) throw new Error('stop');
      wykonane.push(n);
      return n;
    }).catch((x: Error) => x);
    expect((e as Error).message).toBe('stop');
    expect(maks).toBeLessThanOrEqual(3);
    expect(wykonane.length).toBeLessThan(9);
    expect(await wKolejce([1, 2, 3], 2, async (n) => n * 2)).toEqual([2, 4, 6]);
  });
});

describe('publikacja – link podglądu', () => {
  const KLUCZ = 'k'.repeat(48);

  it('token: poprawny, wygasły (podpis sprawdzony), podrobiony, zmieniona strona', () => {
    const teraz = new Date('2026-11-07T12:00:00Z');
    const t = utworzTokenLinku(KLUCZ, ID, new Date('2026-11-14T12:00:00Z'));
    expect(t).toMatch(/^[0-9a-f]{32}[0-9a-z]{7}[0-9a-f]{32}$/);
    expect(sprawdzTokenLinku(KLUCZ, t, teraz)).toMatchObject({ stan: 'ok', stronaId: ID });
    expect(sprawdzTokenLinku(KLUCZ, t, new Date('2026-11-15T00:00:00Z'))).toMatchObject({ stan: 'wygasl', stronaId: ID });
    expect(sprawdzTokenLinku('x'.repeat(48), t, teraz)).toEqual({ stan: 'zly' });
    const innaStrona = `${'0'.repeat(32)}${t.slice(32)}`;
    expect(sprawdzTokenLinku(KLUCZ, innaStrona, teraz)).toEqual({ stan: 'zly' });
    const dluzej = `${t.slice(0, 32)}${'zzzzzzz'}${t.slice(39)}`;
    expect(sprawdzTokenLinku(KLUCZ, dluzej, teraz)).toEqual({ stan: 'zly' });
    expect(sprawdzTokenLinku(KLUCZ, '../etc', teraz)).toEqual({ stan: 'zly' });
  });

  it('pasek wersji próbnej zaraz po <body>, skróty skryptów inline', () => {
    const html = wstawPasekProby('<html><body class="x"><script>a()</script></body></html>');
    expect(html).toMatch(new RegExp(`<body class="x"><div role="note"[^>]*>${PASEK_PROBY}</div><script>`));
    expect(skrotySkryptow(html)).toEqual(["'sha256-qVpDBgj7bpq5hMAcGp3AOc79J3Y1Z4HvySTwKrWDoy4='"]);
  });

  it('kontroler: adres bez ukośnika na końcu → względne przekierowanie 301; złośliwy segment nie przekierowuje', async () => {
    const svc = { stronaLinku: vi.fn(async () => ({ status: 200, html: 'ok', naglowki: { 'X-Robots-Tag': 'noindex' } })) };
    const c = new KreatorLinkController(svc as never);
    const res = () => {
      const r = { redirect: vi.fn(), setHeader: vi.fn(), status: vi.fn(() => r), send: vi.fn() };
      return r;
    };
    const r1 = res();
    await c.strona('tok', { path: '/kreator/p/tok' } as never, r1 as never);
    expect(r1.redirect).toHaveBeenCalledWith(301, 'tok/');
    const r2 = res();
    await c.strona('tok', { path: '/kreator/p/tok/o-nas' } as never, r2 as never);
    expect(r2.redirect).toHaveBeenCalledWith(301, 'o-nas/');
    const r3 = res();
    await c.strona('tok', { path: '/kreator/p/tok/o-nas/' } as never, r3 as never);
    expect(svc.stronaLinku).toHaveBeenLastCalledWith('tok', 'o-nas');
    expect(r3.setHeader).toHaveBeenCalledWith('X-Robots-Tag', 'noindex');
    const r4 = res();
    await c.strona('tok', { path: '/kreator/p/tok/a/b/c/' } as never, r4 as never);
    expect(svc.stronaLinku).toHaveBeenLastCalledWith('tok', null);
    const r5 = res();
    await c.strona('tok', { path: '/kreator/p/tok/javascript:alert(1)' } as never, r5 as never);
    expect(r5.redirect).not.toHaveBeenCalled();
  });

  it('nazwa pliku ZIP bez polskich znaków i znaków specjalnych', () => {
    expect(nazwaZip('Salon „Łąka” – Poznań')).toBe('salon-laka-poznan.zip');
    expect(nazwaZip('"; rm -rf')).toBe('rm-rf.zip');
    expect(nazwaZip('…')).toBe('strona.zip');
  });
});

describe('PlikiHostinguDa – konto hostingu klienta', () => {
  function zbuduj(subs: Array<Record<string, unknown>>) {
    const prisma = { subscription: { findMany: vi.fn(async () => subs) } };
    const klient = { listDir: vi.fn(async () => []), writeFile: vi.fn(), uploadFile: vi.fn(), makeDir: vi.fn(), transferEntries: vi.fn(), deleteEntries: vi.fn(), downloadFile: vi.fn() };
    const da = {
      getClientForServer: vi.fn(async () => ({ asUser: vi.fn(() => klient) })),
      getHostingDocroot: vi.fn(async (_s: string, _u: string, d: string) => ({ domain: d, katalog: '' })),
      listHostingSubdomains: vi.fn(async () => ({ rows: [{ id: 'sklep.x.pl', subdomain: 'sklep', domain: 'x.pl', url: '' }, { id: 'a.y.pl', subdomain: 'a', domain: 'y.pl', url: '' }], domains: [], fetchError: null })),
      listHostingDomainsForSubscription: vi.fn(async () => ({ domains: [{ name: 'X.pl' }, { name: 'y.pl' }], fetchError: null })),
    };
    return { p: new PlikiHostinguDa(prisma as never, da as never), prisma, da, klient };
  }
  const konto = { id: 'a1', domain: 'x.pl', serverId: 's1', daUsername: 'u' };

  it('usługa w okresie próbnym: brak domen do publikacji i brak sesji plików (404)', async () => {
    const t = zbuduj([{ id: 'sub1', isTrial: true, trialConvertedAt: null, account: konto }]);
    expect(await t.p.domenyKlienta('u1')).toEqual([]);
    await expect(t.p.sesja('u1', 'sub1')).rejects.toBeInstanceOf(NotFoundException);
    expect(t.da.getClientForServer).not.toHaveBeenCalled();
  });

  it('opłacona usługa: domeny z konta; zapytanie tylko o własne, działające usługi hostingu z aktywnym kontem', async () => {
    const t = zbuduj([{ id: 'sub1', isTrial: true, trialConvertedAt: new Date(), account: konto }]);
    expect(await t.p.domenyKlienta('u1')).toEqual([
      { domena: 'x.pl', subskrypcjaId: 'sub1' },
      { domena: 'y.pl', subskrypcjaId: 'sub1' },
    ]);
    const where = (t.prisma.subscription.findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where).toMatchObject({ userId: 'u1', plan: { productKind: 'HOSTING' }, account: { status: 'ACTIVE' } });
  });

  it('katalog domeny: public_html (poddomeny chronione) albo katalog główny ustawiony przez klienta', async () => {
    const t = zbuduj([{ id: 'sub1', isTrial: false, trialConvertedAt: null, account: konto }]);
    const s = await t.p.sesja('u1', 'sub1');
    expect(await s.katalogDomeny('x.pl')).toEqual({ katalog: '/domains/x.pl/public_html', katalogDomeny: '/domains/x.pl', chronione: ['sklep'] });
    t.da.getHostingDocroot.mockResolvedValueOnce({ domain: 'x.pl', katalog: 'public' });
    expect(await s.katalogDomeny('x.pl')).toEqual({ katalog: '/domains/x.pl/public_html/public', katalogDomeny: '/domains/x.pl', chronione: [] });
    expect(t.da.getHostingDocroot).toHaveBeenCalledWith('sub1', 'u1', 'x.pl');
    await s.przenies('/a', ['b'], '/c');
    expect(t.klient.transferEntries).toHaveBeenCalledWith('/a', ['b'], '/c', 'move');
  });
});

describe('publikacja – uprawnienia subkont', () => {
  it('publikacja i wycofanie = FILES_MANAGE; stan i ZIP = SERVICES_READ', async () => {
    const { inferCustomerRoutePermissions } = await import('../common/guards/customer-permissions.guard.js');
    expect(inferCustomerRoutePermissions('POST', '/kreator/strony/:id/publikuj')).toEqual(['FILES_MANAGE']);
    expect(inferCustomerRoutePermissions('POST', '/kreator/strony/:id/wycofaj')).toEqual(['FILES_MANAGE']);
    expect(inferCustomerRoutePermissions('GET', '/kreator/strony/:id/publikacja')).toEqual(['SERVICES_READ']);
    expect(inferCustomerRoutePermissions('GET', '/kreator/strony/:id/zip')).toEqual(['SERVICES_READ']);
  });
});
