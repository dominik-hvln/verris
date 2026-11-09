import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { PRZYKLAD_SALON, walidujStrone, type Strona, type WersjaKreatora } from '@verris/kreator';
import { KreatorPublikacjaService } from './publikacja.service.js';

type WynikPublikacji = Awaited<ReturnType<KreatorPublikacjaService['publikuj']>>;
/** Wynik publikacji na domenę (hosting/pro). */
const naDomene = async (w: Promise<WynikPublikacji>) => (await w) as Extract<WynikPublikacji, { tryb: 'domena' }>;
import { LIMIT_BAJTOW, PASEK_PROBY, PLIK_ZNACZNIKA, odczytajZnacznik } from './publikacja.js';
import { utworzTokenLinku } from './publikacja-token.js';
import { utworzTokenFormularza } from './formularz-token.js';
import { fabrykaRendereraPublikacji, type RendererPublikacji } from './renderer-publikacji.js';
import type { PlikiHostingu, SesjaPlikow } from './pliki-hostingu.js';

/**
 * Publikacja kreatora (paczka 121) na atrapach: Prisma (KreatorStrona w pamięci), pliki konta hostingu (system plików
 * w pamięci z dziennikiem operacji), proxy fontów, dostęp do kreatora. Renderer – prawdziwy (@verris/kreator).
 * Zapis na prawdziwym koncie hostingu sprawdza się dopiero na węźle (opis w raporcie paczki).
 */

/** Salon z podstroną „o-nas” (sekcja ze strony głównej z nowym id) – do testów podstron i osieroconych plików. */
const SALON_Z_PODSTRONA = (() => {
  const m = structuredClone(PRZYKLAD_SALON) as unknown as { strony: Array<{ slug: string; sekcje: Array<{ id: string; typ: string }> }> };
  const sekcja = structuredClone(m.strony[0].sekcje.find((x) => x.typ !== 'hero') ?? m.strony[0].sekcje[0]);
  sekcja.id = 'o-nas-tresc';
  m.strony.push({ slug: 'o-nas', tytul: 'O nas', seo: { tytul: 'O nas – salon' }, sekcje: [sekcja] } as never);
  const w = walidujStrone(m);
  if (!w.ok) throw new Error(w.bledy.join('; '));
  return w.strona;
})();
const ID = '11111111-2222-4333-8444-555555555555';
const ID2 = '99999999-2222-4333-8444-555555555555';
const KLUCZ = 'k'.repeat(48);
const PUB = '/domains/x.pl/public_html';
const ZASLEPKA = '<html><body><h1>Witamy na stronie x.pl</h1><p>Hosting Verris</p></body></html>';

type Wpis = { typ: 'dir' } | { typ: 'file'; dane: Buffer };

/** System plików konta w pamięci: ścieżki względem katalogu domowego, dziennik operacji zapisujących. */
class FsAtrapa {
  wpisy = new Map<string, Wpis>([['/', { typ: 'dir' }]]);
  log: string[] = [];
  blad: ((op: string, sciezka: string) => boolean) | null = null;
  wstrzymaj: Promise<void> | null = null;

  constructor() {
    this.dir('/domains');
    this.dir('/domains/x.pl');
    this.dir(PUB);
  }
  dir(p: string) {
    this.wpisy.set(p, { typ: 'dir' });
  }
  plik(p: string, t: string | Buffer) {
    this.wpisy.set(p, { typ: 'file', dane: Buffer.isBuffer(t) ? t : Buffer.from(t) });
  }
  dzieci(p: string) {
    return [...this.wpisy.keys()].filter((k) => k !== p && k.startsWith(`${p === '/' ? '' : p}/`) && !k.slice(p.length + 1).includes('/'));
  }
  tekst(p: string) {
    const w = this.wpisy.get(p);
    return w?.typ === 'file' ? w.dane.toString('utf8') : null;
  }
  private sprawdz(op: string, p: string) {
    if (this.blad?.(op, p)) throw new Error(`DirectAdmin error: ${op} ${p} port 2222 węzeł n1`);
  }
  private poddrzewo(p: string) {
    return [...this.wpisy.keys()].filter((k) => k === p || k.startsWith(`${p}/`));
  }
  sesja(): SesjaPlikow {
    const wymagajKatalogu = (k: string) => {
      if (this.wpisy.get(k)?.typ !== 'dir') throw new Error(`brak katalogu ${k}`);
    };
    const zapisz = async (op: string, k: string, n: string, dane: Buffer) => {
      if (this.wstrzymaj) await this.wstrzymaj;
      this.sprawdz(op, `${k}/${n}`);
      wymagajKatalogu(k);
      this.wpisy.set(`${k}/${n}`, { typ: 'file', dane });
      this.log.push(`${op}:${k}/${n}`);
    };
    return {
      katalogDomeny: async (domena) => {
        if (domena !== 'x.pl') throw new BadRequestException('Domena nie należy do tej usługi.');
        return { katalog: PUB, katalogDomeny: '/domains/x.pl', chronione: ['sklep'] };
      },
      lista: async (p) => {
        this.sprawdz('lista', p);
        wymagajKatalogu(p);
        return this.dzieci(p).map((k) => ({ name: k.slice(k.lastIndexOf('/') + 1), type: this.wpisy.get(k)!.typ }));
      },
      czytaj: async (p) => this.tekst(p),
      zapiszTekst: (k, n, t) => zapisz('zapis', k, n, Buffer.from(t, 'utf8')),
      wgraj: (k, n, d) => zapisz('wgraj', k, n, d),
      utworzKatalog: async (k, n) => {
        this.sprawdz('mkdir', `${k}/${n}`);
        wymagajKatalogu(k);
        if (this.wpisy.has(`${k}/${n}`)) throw new Error('istnieje');
        this.dir(`${k}/${n}`);
        this.log.push(`mkdir:${k}/${n}`);
      },
      przenies: async (k, nazwy, cel) => {
        this.sprawdz('przenies', k);
        wymagajKatalogu(cel);
        for (const n of nazwy) {
          for (const s of this.poddrzewo(`${k}/${n}`)) {
            const w = this.wpisy.get(s)!;
            this.wpisy.delete(s);
            this.wpisy.set(`${cel}/${s.slice(k.length + 1)}`, w);
          }
        }
        this.log.push(`przenies:${k}[${nazwy.join(',')}]->${cel}`);
      },
      usun: async (k, nazwy) => {
        this.sprawdz('usun', k);
        for (const n of nazwy) for (const s of this.poddrzewo(`${k}/${n}`)) this.wpisy.delete(s);
        this.log.push(`usun:${k}[${nazwy.join(',')}]`);
      },
    };
  }
}

type Rek = Record<string, unknown>;

function pasuje(r: Rek, where: Rek): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Rek[]).some((w) => pasuje(r, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      const w = v as Rek;
      if ('not' in w) return r[k] !== w.not;
      if ('lt' in w) return r[k] instanceof Date && (r[k] as Date) < (w.lt as Date);
      return false;
    }
    return r[k] === v;
  });
}

function zbuduj(opcje: { wersja?: WersjaKreatora; renderer?: RendererPublikacji; model?: Strona; zasoby?: unknown } = {}) {
  const strony: Rek[] = [
    {
      id: ID, userId: 'u1', nazwa: 'Salon Ąłka', model: opcje.model ?? SALON_Z_PODSTRONA, status: 'GOTOWA',
      opublikowanaAt: null, domena: null, adres: null, katalog: null, subskrypcjaId: null, kopia: null, podgladDo: null, publikacjaOd: null,
    },
  ];
  const cms: Rek[] = [];
  const prisma = {
    kreatorCms: { findUnique: vi.fn(async ({ where }: { where: Rek }) => cms.find((c) => c.stronaId === where.stronaId) ?? null) },
    kreatorStrona: {
      findFirst: vi.fn(async ({ where }: { where: Rek }) => strony.find((s) => pasuje(s, where)) ?? null),
      findUnique: vi.fn(async ({ where }: { where: Rek }) => strony.find((s) => s.id === where.id) ?? null),
      update: vi.fn(async ({ where, data }: { where: Rek; data: Rek }) => {
        const s = strony.find((x) => x.id === where.id)!;
        Object.assign(s, data);
        return s;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Rek; data: Rek }) => {
        const t = strony.filter((s) => pasuje(s, where));
        t.forEach((s) => Object.assign(s, data));
        return { count: t.length };
      }),
    },
  };
  const fs = new FsAtrapa();
  const hosting = {
    domenyKlienta: vi.fn(async (userId: string) => (userId === 'u1' ? [{ domena: 'x.pl', subskrypcjaId: 'sub1' }] : [])),
    sesja: vi.fn(async (userId: string, sub: string) => {
      if (userId !== 'u1' || sub !== 'sub1') throw new NotFoundException('Nie znaleziono usługi hostingu dla tej domeny.');
      return fs.sesja();
    }),
  } satisfies PlikiHostingu;
  const fonty = {
    plikKreatora: vi.fn(async (n: string) => {
      if (n.includes('-italic-latin-ext')) throw new BadRequestException('Brak pliku fontu w tym zakresie znaków.');
      return { buf: Buffer.from(`font:${n}`), type: 'font/woff2' };
    }),
  };
  const kreator = { dostep: vi.fn(async () => ({ dostep: true, wersja: opcje.wersja ?? 'hosting' })) };
  const audit = { record: vi.fn(async () => undefined) };
  const config = { get: (k: string) => (k === 'appKmsKey' ? KLUCZ : k === 'PUBLIC_API_URL' ? 'https://api.verris.test/' : undefined) };
  const svc = new KreatorPublikacjaService(
    prisma as never, config as never, kreator as never, audit as never, fonty as never, hosting, opcje.renderer ?? fabrykaRendereraPublikacji(),
    opcje.zasoby as never,
  );
  return { svc, strony, prisma, fs, hosting, fonty, audit, kreator, cms };
}

const znacznik = (fs: FsAtrapa) => odczytajZnacznik(fs.tekst(`${PUB}/${PLIK_ZNACZNIKA}`));
const indeks = (log: string[], pref: string) => log.findIndex((l) => l.startsWith(pref));

describe('Kreator – publikacja na domenę (hosting/pro)', () => {
  it('nowa domena z zaślepką: kopia bez pytania → znacznik w toku → pliki (główna na końcu) → znacznik końcowy', async () => {
    const t = zbuduj();
    t.fs.plik(`${PUB}/index.html`, ZASLEPKA);
    t.fs.dir(`${PUB}/cgi-bin`);
    t.fs.dir(`${PUB}/.well-known`);

    const w = await naDomene(t.svc.publikuj('u1', 'u1', ID, { domena: 'X.pl' }));

    expect(w).toMatchObject({ adres: 'https://x.pl/', tryb: 'domena' });
    expect(w.kopia).toMatch(/^domains\/x\.pl\/\.verris-kopia-\d{8}-\d{4}$/);
    const log = t.fs.log;
    // Kopia przed jakimkolwiek zapisem; .well-known (ACME) i cgi-bin zostają na miejscu.
    expect(log[0]).toMatch(/^mkdir:\/domains\/x\.pl\/\.verris-kopia-/);
    expect(log[1]).toMatch(/^przenies:\/domains\/x\.pl\/public_html\[index\.html\]->\/domains\/x\.pl\/\.verris-kopia-/);
    expect(log[2]).toBe(`zapis:${PUB}/${PLIK_ZNACZNIKA}`);
    expect(log.at(-1)).toBe(`zapis:${PUB}/${PLIK_ZNACZNIKA}`);
    expect(log.at(-2)).toBe(`zapis:${PUB}/index.html`);
    expect(indeks(log, `zapis:${PUB}/assets/styl.css`)).toBeLessThan(indeks(log, `zapis:${PUB}/index.html`));
    expect(t.fs.wpisy.has(`${PUB}/cgi-bin`)).toBe(true);
    expect(t.fs.wpisy.has(`${PUB}/.well-known`)).toBe(true);
    expect(t.fs.tekst(`/domains/x.pl/${w.kopia!.split('/').pop()}/index.html`)).toBe(ZASLEPKA);

    // Treść: render publikacji z adresem domeny, fonty w assets/fonty, znacznik z listą plików.
    const html = t.fs.tekst(`${PUB}/index.html`)!;
    expect(html).toContain('<link rel="canonical" href="https://x.pl/');
    expect(html).not.toMatch(/noindex/);
    // Formularz kontaktowy wysyła na API z tokenem strony (nie na nieistniejący /kontakt.php domeny).
    expect(html).toContain(`action="https://api.verris.test/kreator/formularz/${utworzTokenFormularza(KLUCZ, ID)}" method="post"`);
    expect(html).not.toContain('/kontakt.php');
    expect(t.fs.tekst(`${PUB}/assets/kreator.js`)).toContain('// Formularz kontaktowy');
    const z = znacznik(t.fs)!;
    expect(z.stronaId).toBe(ID);
    expect(z.wToku).toBeUndefined();
    expect(z.pliki).toContain('index.html');
    expect(z.pliki.some((p) => /^assets\/fonty\/[a-z0-9-]+-latin\.woff2$/.test(p))).toBe(true);
    expect(z.pliki.length).toBe(w.pliki);
    for (const p of z.pliki) expect(t.fs.wpisy.get(`${PUB}/${p}`)?.typ).toBe('file');
    expect(log.some((l) => l.startsWith(`wgraj:${PUB}/assets/fonty/`))).toBe(true);
    // Brak zakresu latin-ext dla kursywy → ostrzeżenie zamiast błędu.
    const kursywa = t.fonty.plikKreatora.mock.calls.some(([n]) => n.includes('-italic-latin-ext'));
    expect(w.ostrzezenia.some((o) => o.includes('zakresu znaków'))).toBe(kursywa);

    const r = t.strony[0];
    expect(r).toMatchObject({ domena: 'x.pl', adres: 'https://x.pl/', katalog: PUB, subskrypcjaId: 'sub1', publikacjaOd: null });
    expect(r.opublikowanaAt).toBeInstanceOf(Date);
    expect(r.kopia).toMatch(/^\/domains\/x\.pl\/\.verris-kopia-/);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_KREATOR_PUBLISHED', userId: 'u1' }));
  });

  it('katalog z cudzymi plikami bez zastap → 409 KATALOG_ZAJETY z listą (do 20), nic nie zapisane ani przeniesione', async () => {
    const t = zbuduj();
    t.fs.dir(`${PUB}/wp-content`); // serwer listuje katalogi przed plikami
    for (let i = 0; i < 25; i++) t.fs.plik(`${PUB}/plik-${String(i).padStart(2, '0')}.php`, 'x');
    t.fs.dir(`${PUB}/sklep`); // katalog poddomeny – nie jest „cudzym plikiem” i nigdy nie trafia do kopii

    const e = await t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ConflictException);
    const odp = (e as ConflictException).getResponse() as { kod: string; pliki: string[]; message: string };
    expect(odp.kod).toBe('KATALOG_ZAJETY');
    expect(odp.pliki).toHaveLength(20);
    expect(odp.pliki).toContain('wp-content/');
    expect(odp.pliki).not.toContain('sklep/');
    expect(odp.message).not.toMatch(/DirectAdmin|2222/);
    expect(t.fs.log).toEqual([]);
    expect(t.strony[0].publikacjaOd).toBeNull();
    expect(t.strony[0].opublikowanaAt).toBeNull();
  });

  it('z zastap: cudze pliki do kopii (poza public_html), katalog poddomeny zostaje; wycofanie usuwa pliki kreatora i przywraca kopię', async () => {
    const t = zbuduj();
    t.fs.plik(`${PUB}/index.php`, '<?php wp();');
    t.fs.plik(`${PUB}/.htaccess`, 'RewriteEngine On');
    t.fs.dir(`${PUB}/wp-content`);
    t.fs.plik(`${PUB}/wp-content/a.txt`, 'a');
    t.fs.dir(`${PUB}/sklep`);
    t.fs.plik(`${PUB}/sklep/index.html`, 'sklep');

    const w = await naDomene(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl', zastap: true }));
    const kopia = `/${w.kopia}`;
    expect(kopia.startsWith('/domains/x.pl/.verris-kopia-')).toBe(true);
    expect(kopia.startsWith(PUB)).toBe(false);
    expect(t.fs.tekst(`${kopia}/index.php`)).toBe('<?php wp();');
    expect(t.fs.tekst(`${kopia}/wp-content/a.txt`)).toBe('a');
    expect(t.fs.tekst(`${PUB}/sklep/index.html`)).toBe('sklep');
    expect(indeks(t.fs.log, 'przenies:')).toBeLessThan(indeks(t.fs.log, 'zapis:'));

    t.fs.log = [];
    const r = await t.svc.wycofaj('u1', 'u1', ID);
    expect(r).toMatchObject({ ok: true, przywrocono: true, tryb: 'domena' });
    expect(t.fs.tekst(`${PUB}/index.php`)).toBe('<?php wp();');
    expect(t.fs.tekst(`${PUB}/.htaccess`)).toBe('RewriteEngine On');
    expect(t.fs.tekst(`${PUB}/wp-content/a.txt`)).toBe('a');
    expect(t.fs.tekst(`${PUB}/sklep/index.html`)).toBe('sklep');
    expect(t.fs.wpisy.has(kopia)).toBe(false);
    expect(t.fs.wpisy.has(`${PUB}/${PLIK_ZNACZNIKA}`)).toBe(false);
    expect(t.fs.wpisy.has(`${PUB}/assets`)).toBe(false);
    expect(t.fs.wpisy.has(`${PUB}/index.html`)).toBe(false);
    // Najpierw usunięcie plików kreatora, potem przywrócenie kopii.
    expect(indeks(t.fs.log, 'usun:')).toBeLessThan(indeks(t.fs.log, 'przenies:'));
    expect(t.strony[0]).toMatchObject({ opublikowanaAt: null, adres: null, kopia: null, katalog: null, domena: null });
    expect(t.audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'HOSTING_KREATOR_UNPUBLISHED' }));
  });

  it('ponowna publikacja: osierocone pliki (usunięta podstrona) usunięte z pustym katalogiem, fonty nie są wgrywane drugi raz, pliki klienta zostają', async () => {
    const t = zbuduj();
    await t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' });
    const przed = znacznik(t.fs)!.pliki;
    const podstrona = przed.find((p) => /^[a-z0-9-]+\/index\.html$/.test(p) && !p.startsWith('assets/'))!;
    expect(podstrona).toBeTruthy();
    const slug = podstrona.split('/')[0];
    // Klient dorzucił plik weryfikacyjny Google – nie należy do kreatora, ponowna publikacja go nie rusza.
    t.fs.plik(`${PUB}/google123.html`, 'google-site-verification');

    const model = structuredClone(SALON_Z_PODSTRONA);
    model.strony = model.strony.filter((p) => p.slug !== slug);
    t.strony[0].model = model;
    t.fs.log = [];
    await t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' });

    expect(t.fs.wpisy.has(`${PUB}/${slug}`)).toBe(false);
    expect(znacznik(t.fs)!.pliki).not.toContain(podstrona);
    expect(t.fs.log.some((l) => l.startsWith('wgraj:'))).toBe(false);
    expect(t.fs.log.some((l) => l.startsWith('przenies:'))).toBe(false);
    expect(t.fs.tekst(`${PUB}/google123.html`)).toBe('google-site-verification');
    expect(t.fs.log).toContain(`usun:${PUB}[${slug}]`);
  });

  it('cudza domena → 404 bez otwierania plików konta; domena innej strony tego konta → 409', async () => {
    const t = zbuduj();
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'cudza.pl' })).rejects.toBeInstanceOf(NotFoundException);
    expect(t.hosting.sesja).not.toHaveBeenCalled();
    t.strony[0].opublikowanaAt = new Date();
    t.strony[0].domena = 'inna.pl';
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toBeInstanceOf(ConflictException);
    await expect(t.svc.publikuj('u1', 'u1', ID, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: '../../etc' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('paczka 124: strona przeniesiona do WordPressa – publikacja i wycofanie zablokowane z wyjaśnieniem, bez operacji na plikach', async () => {
    const t = zbuduj();
    await t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' });
    t.hosting.sesja.mockClear();
    for (const stan of ['ZAMIANA_W_TOKU', 'PRZENIESIONA', 'COFANIE_W_TOKU']) {
      t.cms.splice(0, t.cms.length, { stronaId: ID, stan });
      await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toThrow(/działa już w WordPressie/);
      await expect(t.svc.wycofaj('u1', 'u1', ID)).rejects.toBeInstanceOf(ConflictException);
      const st = await t.svc.stan('u1', ID);
      expect(st).toMatchObject({ mozliwa: false, powod: expect.stringMatching(/WordPressie/) });
    }
    expect(t.hosting.sesja).not.toHaveBeenCalled();
    // Podgląd WordPressa obok strony albo cofnięte przejście – kreator dalej publikuje.
    for (const stan of ['PODGLAD', 'COFNIETA']) {
      t.cms.splice(0, t.cms.length, { stronaId: ID, stan });
      await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).resolves.toMatchObject({ tryb: 'domena' });
    }
  });

  it('cudza strona → 404', async () => {
    const t = zbuduj();
    t.strony[0].userId = 'u2';
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(t.svc.zip('u1', ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['../../.ssh/authorized_keys'],
    ['/home/u/public_html/x.php'],
    ['.htaccess'],
    [PLIK_ZNACZNIKA],
    ['a//b.html'],
    ['Index.HTML'],
    ['skrypt.php?x=1'],
  ])('złośliwa ścieżka w renderze (%s) → 422, żadnej operacji na koncie', async (sciezka) => {
    const renderer: RendererPublikacji = {
      renderuj: () => ({ pliki: [{ sciezka: 'index.html', tresc: '<html></html>', typ: 'text/html' }, { sciezka, tresc: 'x', typ: 'text/plain' }], fonty: [], ostrzezenia: [] }),
    };
    const t = zbuduj({ renderer });
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(t.hosting.sesja).not.toHaveBeenCalled();
    expect(t.fs.log).toEqual([]);
    await expect(t.svc.zip('u1', ID)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('render ponad limit rozmiaru → 422 bez operacji na koncie', async () => {
    const renderer: RendererPublikacji = {
      renderuj: () => ({ pliki: [{ sciezka: 'index.html', tresc: 'x'.repeat(LIMIT_BAJTOW + 1), typ: 'text/html' }], fonty: [], ostrzezenia: [] }),
    };
    const t = zbuduj({ renderer });
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toThrow(/za duża/);
    expect(t.hosting.sesja).not.toHaveBeenCalled();
  });

  it('błąd serwera plików → 503 po polsku bez szczegółów serwera; blokada zwolniona, a przerwana publikacja zostawia znacznik „w toku”', async () => {
    const t = zbuduj();
    t.fs.blad = (op, p) => op === 'zapis' && p.endsWith('/index.html');
    const e = await t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect((e as Error).message).toMatch(/^Nie udało się zapisać plików na hostingu/);
    expect((e as Error).message).not.toMatch(/DirectAdmin|2222|n1/);
    expect(t.strony[0].publikacjaOd).toBeNull();
    expect(t.strony[0].opublikowanaAt).toBeNull();
    expect(znacznik(t.fs)).toMatchObject({ stronaId: ID, wToku: true });
    // Kolejna próba rozpoznaje pliki jako własne (bez 409) i kończy publikację.
    t.fs.blad = null;
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).resolves.toMatchObject({ tryb: 'domena' });
    expect(znacznik(t.fs)!.wToku).toBeUndefined();
  });

  it('równoległa publikacja tej samej strony → 409 „już trwa”', async () => {
    const t = zbuduj();
    let pusc!: () => void;
    t.fs.wstrzymaj = new Promise((r) => (pusc = r));
    const pierwsza = t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' });
    await new Promise((r) => setTimeout(r, 10));
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toThrow(/już trwa/);
    // Blokada w bazie (inna replika API): publikacjaOd ustawione, świeże.
    expect(t.strony[0].publikacjaOd).toBeInstanceOf(Date);
    t.fs.wstrzymaj = null;
    pusc();
    await pierwsza;
    expect(t.strony[0].publikacjaOd).toBeNull();
  });

  it('GET publikacja: stan katalogu domeny – pusta, kreator (znacznik tej strony), zajęta, nieznany przy błędzie listowania', async () => {
    const t = zbuduj();
    const stan = async () => (await t.svc.stan('u1', ID)).domeny[0].stan;
    expect(await stan()).toBe('pusta');
    t.fs.plik(`${PUB}/index.html`, ZASLEPKA);
    expect(await stan()).toBe('pusta');
    t.fs.plik(`${PUB}/wp-config.php`, 'x');
    expect(await stan()).toBe('zajeta');
    await t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl', zastap: true });
    const s = await t.svc.stan('u1', ID);
    expect(s).toMatchObject({ wersja: 'hosting', mozliwa: true, domeny: [{ domena: 'x.pl', subskrypcjaId: 'sub1', stan: 'kreator' }] });
    expect(s.opublikowana).toMatchObject({ adres: 'https://x.pl/', domena: 'x.pl' });
    t.fs.blad = (op) => op === 'lista';
    expect(await stan()).toBe('nieznany');
    // Znacznik innej strony = katalog zajęty.
    t.fs.blad = null;
    t.fs.plik(`${PUB}/${PLIK_ZNACZNIKA}`, JSON.stringify({ stronaId: ID2, pliki: ['index.html'], at: '' }));
    expect(await stan()).toBe('zajeta');
  });

  it('GET publikacja bez domen na opłaconym hostingu → mozliwa: false z powodem', async () => {
    const t = zbuduj();
    t.hosting.domenyKlienta.mockResolvedValueOnce([]);
    const s = await t.svc.stan('u1', ID);
    expect(s.mozliwa).toBe(false);
    expect(s.powod).toMatch(/domen/);
    expect(s.zmianyPlanu).toEqual(expect.any(Array));
  });
});

describe('Kreator – link podglądu wersji próbnej', () => {
  it('próba bez domeny → link 7 dni; strona z paskiem, noindex, CSP bez sandboxu i bez unsafe-inline w skryptach', async () => {
    const t = zbuduj({ wersja: 'proba' });
    const w = await t.svc.publikuj('u1', 'u1', ID, {});
    expect(w.tryb).toBe('podglad');
    const m = /^https:\/\/api\.verris\.test\/kreator\/p\/([0-9a-z]{71})\/$/.exec(w.adres);
    expect(m).not.toBeNull();
    const dni = ((w as { wazneDo: Date }).wazneDo.getTime() - Date.now()) / 86400000;
    expect(dni).toBeGreaterThan(6.99);
    expect(dni).toBeLessThanOrEqual(7);
    expect(t.hosting.sesja).not.toHaveBeenCalled();

    const r = await t.svc.stronaLinku(m![1], '');
    expect(r.status).toBe(200);
    expect(r.html).toContain(PASEK_PROBY);
    expect(r.html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(r.html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(r.naglowki['X-Robots-Tag']).toMatch(/noindex/);
    const csp = r.naglowki['Content-Security-Policy'];
    expect(csp).not.toMatch(/sandbox/);
    expect(csp).toMatch(/default-src 'none'/);
    expect(csp).toMatch(/font-src data: https:\/\/api\.verris\.test/);
    expect(csp).toMatch(/form-action 'none'/);
    const skrypty = /script-src ([^;]+)/.exec(csp)![1];
    expect(skrypty).not.toMatch(/unsafe-inline/);

    // Podstrona i GET publikacja pokazują link.
    const slug = 'o-nas';
    expect((await t.svc.stronaLinku(m![1], slug)).status).toBe(200);
    expect((await t.svc.stronaLinku(m![1], 'nie-ma-takiej')).status).toBe(404);
    const s = await t.svc.stan('u1', ID);
    expect(s).toMatchObject({ wersja: 'proba', mozliwa: true, domeny: [], linkPodgladu: { adres: w.adres } });
  });

  it('próba z domeną → 403 (w próbie tylko link podglądu); ZIP w próbie → 403', async () => {
    const t = zbuduj({ wersja: 'proba' });
    await expect(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(t.svc.zip('u1', ID)).rejects.toThrow(/opłaceniu hostingu/);
  });

  it('wygasły token → strona „Link wygasł” (410); podrobiony → 404; wycofany i usunięta strona – link przestaje działać', async () => {
    const t = zbuduj({ wersja: 'proba' });
    const dawno = new Date(Math.floor((Date.now() - 1000) / 1000) * 1000);
    t.strony[0].podgladDo = dawno;
    const stary = utworzTokenLinku(KLUCZ, ID, dawno);
    const r = await t.svc.stronaLinku(stary, '');
    expect(r.status).toBe(410);
    expect(r.html).toContain('Link wygasł');
    expect(r.naglowki['X-Robots-Tag']).toMatch(/noindex/);
    expect(r.naglowki['Content-Security-Policy']).toMatch(/script-src 'none'/);

    const podrobiony = utworzTokenLinku('inny-klucz'.repeat(5), ID, new Date(Date.now() + 86400000));
    expect((await t.svc.stronaLinku(podrobiony, '')).status).toBe(404);
    expect((await t.svc.stronaLinku('abc', '')).status).toBe(404);

    const w = await t.svc.publikuj('u1', 'u1', ID, {});
    const token = /\/p\/([0-9a-z]+)\//.exec(w.adres)![1];
    expect((await t.svc.stronaLinku(token, '')).status).toBe(200);
    await t.svc.wycofaj('u1', 'u1', ID);
    expect((await t.svc.stronaLinku(token, '')).status).toBe(410);
    await t.svc.publikuj('u1', 'u1', ID, {});
    t.strony.splice(0, 1); // usunięcie strony
    expect((await t.svc.stronaLinku(token, '')).status).toBe(404);
  });
});

describe('Kreator – ZIP strony', () => {
  it('ZIP z renderem publikacji i fontami otwiera się (unzip -t) i ma komplet plików', async () => {
    const t = zbuduj();
    const { nazwa, dane } = await t.svc.zip('u1', ID);
    expect(nazwa).toBe('Salon Ąłka');
    expect(dane.subarray(0, 4).toString('hex')).toBe('504b0304');
    expect(t.hosting.sesja).not.toHaveBeenCalled();
    if (!existsSync('/usr/bin/unzip')) return;
    const kat = mkdtempSync(join(tmpdir(), 'kreator-zip-'));
    try {
      writeFileSync(join(kat, 'strona.zip'), dane);
      expect(execFileSync('unzip', ['-t', join(kat, 'strona.zip')]).toString()).toMatch(/No errors detected/);
      const lista = execFileSync('unzip', ['-Z1', join(kat, 'strona.zip')]).toString().trim().split('\n');
      expect(lista).toContain('index.html');
      expect(lista).toContain('assets/styl.css');
      expect(lista.some((p) => /^assets\/fonty\/.+\.woff2$/.test(p))).toBe(true);
      execFileSync('unzip', ['-q', join(kat, 'strona.zip'), '-d', join(kat, 'x')]);
      expect(existsSync(join(kat, 'x', 'index.html'))).toBe(true);
      // Strona nieopublikowana: formularz w ZIP wyłączony, README to wyjaśnia.
      expect(readFileSync(join(kat, 'x', 'index.html'), 'utf8')).toContain('Formularz zadziała po publikacji strony.');
      expect(readFileSync(join(kat, 'x', 'README.txt'), 'utf8')).toContain('zacznie działać po opublikowaniu');
    } finally {
      rmSync(kat, { recursive: true, force: true });
    }
  });

  it('ZIP opublikowanej strony: formularz wysyła do Verris (token strony), README.txt mówi o tym jednym zdaniem', async () => {
    const t = zbuduj();
    Object.assign(t.strony[0], { opublikowanaAt: new Date(), domena: 'x.pl', adres: 'https://x.pl/' });
    const { dane } = await t.svc.zip('u1', ID);
    if (!existsSync('/usr/bin/unzip')) return;
    const kat = mkdtempSync(join(tmpdir(), 'kreator-zip-'));
    try {
      writeFileSync(join(kat, 'strona.zip'), dane);
      execFileSync('unzip', ['-q', join(kat, 'strona.zip'), '-d', join(kat, 'x')]);
      expect(readFileSync(join(kat, 'x', 'index.html'), 'utf8')).toContain(`action="https://api.verris.test/kreator/formularz/${utworzTokenFormularza(KLUCZ, ID)}"`);
      expect(readFileSync(join(kat, 'x', 'README.txt'), 'utf8')).toContain('Formularz kontaktowy wysyła wiadomości przez serwer Verris');
    } finally {
      rmSync(kat, { recursive: true, force: true });
    }
  });
});

describe('Kreator – zdjęcia z biblioteki w publikacji (paczka 122)', () => {
  const ZASOB = '3f2a9c4e-8b1d-4f6a-9c2e-1a2b3c4d5e6f';
  const zeZdjeciem = (): Strona => {
    const m = structuredClone(SALON_Z_PODSTRONA);
    const hero = m.strony[0]!.sekcje.find((x) => x.typ === 'hero')!;
    if (hero.typ !== 'hero') throw new Error('hero');
    hero.dane.obraz = { alt: 'Wnętrze', zrodlo: 'pixabay', zasobId: ZASOB, proporcje: '4:3', autor: 'Jan', licencja: 'pixabay' };
    return m;
  };
  /** Atrapa KreatorZasobyService.doPublikacji: wymiary z „bazy” (1200 px → warianty 480 i 960) i pliki wariantów. */
  const zasoby = () => ({
    doPublikacji: vi.fn(async (_u: string, strona: Strona, tryb: 'pliki' | 'adresy') => {
      const m = structuredClone(strona);
      const hero = m.strony[0]!.sekcje.find((x) => x.typ === 'hero')!;
      if (hero.typ === 'hero' && hero.dane.obraz) Object.assign(hero.dane.obraz, { szerokosc: 1200, wysokosc: 800 });
      if (tryb === 'adresy') return { strona: m, adresZasobu: (id: string, sz: number, f: string) => `https://api.verris.test/kreator/z/t${id}/${sz}.${f}`, pliki: [] };
      const pliki = [480, 960].flatMap((sz) => (['webp', 'jpg'] as const).map((f) => ({ sciezka: `assets/img/${ZASOB}-${sz}.${f}`, dane: Buffer.from(`${sz}.${f}`), tekst: false })));
      return { strona: m, adresZasobu: (id: string, sz: number, f: string) => `assets/img/${id}-${sz}.${f}`, pliki };
    }),
  });

  it('domena: warianty wgrane do assets/img, HTML z <picture>; ponowna publikacja bez zdjęcia usuwa osierocone pliki', async () => {
    const t = zbuduj({ model: zeZdjeciem(), zasoby: zasoby() });
    await naDomene(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' }));
    expect(t.fs.log).toContain(`wgraj:${PUB}/assets/img/${ZASOB}-960.webp`);
    expect(t.fs.log).toContain(`wgraj:${PUB}/assets/img/${ZASOB}-480.jpg`);
    const html = t.fs.tekst(`${PUB}/index.html`)!;
    expect(html).toContain(`<source type="image/webp" srcset="assets/img/${ZASOB}-480.webp 480w, assets/img/${ZASOB}-960.webp 960w"`);
    expect(znacznik(t.fs)!.pliki).toContain(`assets/img/${ZASOB}-960.jpg`);

    t.strony[0]!.model = SALON_Z_PODSTRONA;
    await naDomene(t.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' }));
    expect(t.fs.wpisy.has(`${PUB}/assets/img/${ZASOB}-960.webp`)).toBe(false);
    expect(t.fs.wpisy.has(`${PUB}/assets/img`)).toBe(false);
  });

  it('link próbny: adresy plików w API (bez kopiowania); model ze zdjęciem bez serwisu zdjęć → 503 przed hostingiem', async () => {
    const z = zasoby();
    const t = zbuduj({ wersja: 'proba', model: zeZdjeciem(), zasoby: z });
    const { adres } = (await t.svc.publikuj('u1', 'u1', ID, {})) as { adres: string };
    const token = adres.split('/kreator/p/')[1]!.replace(/\/$/, '');
    const strona = await t.svc.stronaLinku(token, '');
    expect(strona.status).toBe(200);
    expect(strona.html).toContain(`https://api.verris.test/kreator/z/t${ZASOB}/960.jpg`);
    expect(z.doPublikacji).toHaveBeenCalledWith('u1', expect.anything(), 'adresy');

    const bez = zbuduj({ model: zeZdjeciem() });
    await expect(bez.svc.publikuj('u1', 'u1', ID, { domena: 'x.pl' })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(bez.hosting.sesja).not.toHaveBeenCalled();
  });
});
