import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { inflateRawSync } from 'zlib';
import { PRZYKLAD_SALON, walidujStrone, parsujBloki, type Strona } from '@verris/kreator';
import { KreatorWordpressService, OKRES_COFNIECIA_DNI } from './kreator-wordpress.service.js';
import type { PlikiHostingu, SesjaPlikow } from '../pliki-hostingu.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ZASOB = '22222222-2222-4222-8222-222222222222';
const PUB = '/domains/x.pl/public_html';

type Rek = Record<string, unknown>;

/** Nazwy i treść plików ZIP z katalogu centralnego (archiver: deflate albo store). */
function czytajZip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const ile = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const wynik = new Map<string, Buffer>();
  for (let i = 0; i < ile; i++) {
    const metoda = buf.readUInt16LE(p + 10);
    const rozmiar = buf.readUInt32LE(p + 20);
    const n = buf.readUInt16LE(p + 28);
    const e = buf.readUInt16LE(p + 30);
    const k = buf.readUInt16LE(p + 32);
    const lokalny = buf.readUInt32LE(p + 42);
    const nazwa = buf.toString('utf8', p + 46, p + 46 + n);
    const start = lokalny + 30 + buf.readUInt16LE(lokalny + 26) + buf.readUInt16LE(lokalny + 28);
    const dane = buf.subarray(start, start + rozmiar);
    wynik.set(nazwa, metoda === 8 ? inflateRawSync(dane) : Buffer.from(dane));
    p += 46 + n + e + k;
  }
  return wynik;
}

function modelZeZdjeciem(): Strona {
  const w = structuredClone(PRZYKLAD_SALON) as { strony: { sekcje: { typ: string; dane: Rek }[] }[] };
  w.strony[0]!.sekcje[0]!.dane.obraz = { alt: 'Wnętrze', zrodlo: 'wlasne', zasobId: ZASOB, szerokosc: 1600, wysokosc: 2000, proporcje: '4:5' };
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
}

/** Katalogi konta w pamięci: ścieżka → wpisy. */
function plikiKonta() {
  const katalogi = new Map<string, Map<string, { type: 'file' | 'dir'; dane?: Buffer }>>([
    ['/domains/x.pl', new Map([['public_html', { type: 'dir' as const }]])],
    [
      PUB,
      new Map<string, { type: 'file' | 'dir'; dane?: Buffer }>([
        ['index.html', { type: 'file' }],
        ['o-nas', { type: 'dir' }],
        ['assets', { type: 'dir' }],
        ['google123.html', { type: 'file' }],
        [
          '.verris-kreator.json',
          { type: 'file', dane: Buffer.from(JSON.stringify({ stronaId: ID, pliki: ['index.html', 'o-nas/index.html', 'assets/styl.css', '404.html'], at: '2026-11-09' })) },
        ],
      ]),
    ],
  ]);
  const log: string[] = [];
  const sesja: SesjaPlikow = {
    katalogDomeny: async (d) => ({ katalog: `/domains/${d}/public_html`, katalogDomeny: `/domains/${d}`, chronione: [] }),
    lista: async (s) => [...(katalogi.get(s) ?? new Map()).entries()].map(([name, w]) => ({ name, type: w.type })),
    czytaj: async (s) => {
      const k = katalogi.get(s.slice(0, s.lastIndexOf('/')));
      return k?.get(s.slice(s.lastIndexOf('/') + 1))?.dane?.toString('utf8') ?? null;
    },
    zapiszTekst: async () => undefined,
    wgraj: async (k, n, d) => {
      log.push(`wgraj ${k}/${n}`);
      katalogi.get(k)!.set(n, { type: 'file', dane: d });
    },
    utworzKatalog: async (k, n) => {
      log.push(`mkdir ${k}/${n}`);
      katalogi.get(k)!.set(n, { type: 'dir' });
      katalogi.set(`${k}/${n}`, new Map());
    },
    przenies: async () => undefined,
    usun: async (k, n) => {
      log.push(`usun ${k}/${n.join(',')}`);
      for (const x of n) katalogi.get(k)?.delete(x);
    },
  };
  return { katalogi, log, sesja };
}

function zbuduj(o: { wersja?: 'proba' | 'hosting' | 'pro'; bladBazy?: boolean; opublikowana?: boolean } = {}) {
  const strona: Rek = {
    id: ID, userId: 'u1', status: 'GOTOWA', model: modelZeZdjeciem(),
    opublikowanaAt: o.opublikowana === false ? null : new Date('2026-11-01'), domena: 'x.pl', katalog: PUB, subskrypcjaId: 'sub1',
  };
  let cms: Rek | null = null;
  const zadania: Rek[] = [];
  const pk = plikiKonta();
  const prisma = {
    kreatorStrona: { findFirst: vi.fn(async ({ where }: { where: Rek }) => (where.id === ID && where.userId === 'u1' ? strona : null)) },
    kreatorCms: {
      findUnique: vi.fn(async ({ where }: { where: Rek }) => (cms && (where.stronaId === cms.stronaId || where.id === cms.id) ? { ...cms } : null)),
      upsert: vi.fn(async ({ create, update }: { create: Rek; update: Rek }) => {
        cms = cms ? { ...cms, ...update } : { id: 'cms1', createdAt: new Date(), ...create };
        return { ...cms };
      }),
      update: vi.fn(async ({ data }: { data: Rek }) => {
        cms = { ...cms!, ...data };
        return { ...cms };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Rek; data: Rek }) => {
        if (!cms || cms.stan !== where.stan || cms.zadanieId !== where.zadanieId) return { count: 0 };
        cms = { ...cms, ...data };
        return { count: 1 };
      }),
    },
    nodeTask: {
      create: vi.fn(async ({ data }: { data: Rek }) => {
        const z = { id: `z${zadania.length + 1}`, ...data };
        zadania.push(z);
        return z;
      }),
      findFirst: vi.fn(async () => zadania.find((z) => z.status === 'QUEUED' || z.status === 'RUNNING') ?? null),
      findUnique: vi.fn(async ({ where }: { where: Rek }) => zadania.find((z) => z.id === where.id) ?? null),
    },
    subscription: {
      findFirst: vi.fn(async ({ where }: { where: Rek }) => (where.id === 'sub1' && where.userId === 'u1' ? { account: { id: 'acc1', serverId: 'srv1', daUsername: 'klient1', status: 'ACTIVE' } } : null)),
    },
    user: { findUnique: vi.fn(async () => ({ email: 'wlasciciel@example.com' })) },
  };
  const config = { get: (k: string) => (k === 'appKmsKey' ? 'a'.repeat(64) : k === 'PUBLIC_API_URL' ? 'https://api.verris.test' : undefined) };
  const kreator = { dostep: vi.fn(async () => ({ dostep: true, wersja: o.wersja ?? 'hosting' })) };
  const audit = { record: vi.fn(async () => undefined) };
  const klientDa = {
    createMysqlDatabase: vi.fn(async ({ name }: { name: string }) => {
      if (o.bladBazy) throw new Error('CMD_API_DATABASES: limit');
      return { database: `klient1_${name}`, username: `klient1_${name}` };
    }),
  };
  const da = { getClientForHostingAccount: vi.fn(async () => klientDa) };
  const fonty = {
    plikKreatora: vi.fn(async (n: string) => {
      if (n.includes('-italic-latin-ext')) throw new BadRequestException('Brak pliku fontu w tym zakresie znaków.');
      return { buf: Buffer.from(`font:${n}`), type: 'font/woff2' };
    }),
  };
  const hosting = { domenyKlienta: vi.fn(async () => [{ domena: 'x.pl', subskrypcjaId: 'sub1' }]), sesja: vi.fn(async () => pk.sesja) } satisfies PlikiHostingu;
  const zasoby = {
    doPublikacji: vi.fn(async (_u: string, s: Strona) => ({
      strona: s,
      pliki: [480, 960, 1600].flatMap((w) => (['webp', 'jpg'] as const).map((f) => ({ sciezka: `assets/img/${ZASOB}-${w}.${f}`, dane: Buffer.from(`zdjecie-${w}.${f}`), tekst: false }))),
    })),
  };
  const svc = new KreatorWordpressService(prisma as never, config as never, kreator as never, audit as never, da as never, fonty as never, hosting, zasoby as never);
  return { svc, prisma, zadania, pk, audit, klientDa, kreator, cms: () => cms, ustawCms: (c: Rek | null) => (cms = c), strona };
}

describe('Kreator – przejście na WordPressa (paczka 124)', () => {
  it('stan: lista celów z API, w próbie i bez opublikowanej strony niedostępne z powodem', async () => {
    const t = zbuduj();
    await expect(t.svc.stan('u1', ID)).resolves.toMatchObject({ dostepny: true, domena: 'x.pl', wordpress: null, cele: [{ id: 'wordpress', nazwa: 'WordPress' }] });
    const p = zbuduj({ wersja: 'proba' });
    await expect(p.svc.stan('u1', ID)).resolves.toMatchObject({ dostepny: false, powod: expect.stringMatching(/opłaceniu hostingu/) });
    await expect(p.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' })).rejects.toBeInstanceOf(ForbiddenException);
    const n = zbuduj({ opublikowana: false });
    await expect(n.svc.stan('u1', ID)).resolves.toMatchObject({ dostepny: false, powod: expect.stringMatching(/opublikuj stronę/) });
  });

  it('podgląd: paczka ZIP w katalogu domeny (poza public_html), baza, zadanie KREATOR_WP z danymi dla węzła, hasło administratora tylko w odpowiedzi', async () => {
    const t = zbuduj();
    const w = await t.svc.uruchom('u1', 'actor', ID, { domena: 'x.pl', tryb: 'podglad' });
    const z = t.zadania[0]!;
    const p = z.payload as Rek;
    expect(z).toMatchObject({ kind: 'KREATOR_WP', status: 'QUEUED', serverId: 'srv1', accountId: 'acc1', requestedById: 'actor' });
    expect(p).toMatchObject({
      tryb: 'podglad', daUser: 'klient1', domain: 'x.pl', dir: 'domains/x.pl/public_html', locale: 'pl_PL', adminEmail: 'wlasciciel@example.com',
      dbName: expect.stringMatching(/^klient1_wk[0-9a-f]{6}$/), adminUser: expect.stringMatching(/^admin_[0-9a-f]{6}$/),
    });
    expect(p.klucz).toMatch(/^[0-9a-f]{24}$/);
    expect(p.paczka).toBe(`domains/x.pl/.verris-kreator-wp/${p.klucz}.zip`);
    expect(t.pk.log).toEqual(['mkdir /domains/x.pl/.verris-kreator-wp', `wgraj /domains/x.pl/.verris-kreator-wp/${p.klucz}.zip`]);
    expect(w).toMatchObject({ stan: 'PODGLAD_W_TOKU', domena: 'x.pl', adminLogin: p.adminUser, adminHaslo: p.adminPass, adresPodgladu: null });
    expect(t.cms()).not.toHaveProperty('adminHaslo');
    expect(JSON.stringify(t.cms())).not.toContain(String(p.adminPass));
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_KREATOR_WP_PODGLAD', actorUserId: 'actor' }));

    const zip = czytajZip(t.pk.katalogi.get('/domains/x.pl/.verris-kreator-wp')!.get(`${p.klucz}.zip`)!.dane!);
    const tresc = JSON.parse(zip.get('tresc.json')!.toString('utf8')) as { strony: { tresc: string }[]; media: { nazwaPliku: string }[]; motyw: { katalog: string; pliki?: unknown } };
    expect(tresc.motyw).toMatchObject({ katalog: 'verris-kreator' });
    expect(tresc.motyw.pliki).toBeUndefined();
    for (const s of tresc.strony) expect(() => parsujBloki(s.tresc)).not.toThrow();
    // Formularz strony z WordPressa wysyła na ten sam adres Verris co strona statyczna.
    expect(tresc.strony[0]!.tresc).toContain('action="https://api.verris.test/kreator/formularz/');
    expect(zip.has('motyw/style.css') && zip.has('motyw/theme.json') && zip.has('motyw/parts/header.html')).toBe(true);
    const fonty = [...zip.keys()].filter((k) => k.startsWith('motyw/assets/fonts/'));
    expect(fonty.length).toBeGreaterThan(0);
    expect(fonty.some((f) => f.includes('-italic-latin-ext'))).toBe(false);
    expect(zip.get(`media/${ZASOB}.jpg`)?.toString()).toBe('zdjecie-1600.jpg');
  });

  it('podgląd: błąd zakładania bazy → 503 po polsku bez szczegółów serwera, paczka usunięta, bez zadania', async () => {
    const t = zbuduj({ bladBazy: true });
    const e = await t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ServiceUnavailableException);
    expect((e as Error).message).not.toMatch(/CMD_API/);
    expect(t.zadania).toHaveLength(0);
    expect(t.pk.log.at(-1)).toMatch(/^usun \/domains\/x\.pl\/\.verris-kreator-wp\/[0-9a-f]{24}\.zip$/);
  });

  it('inna domena niż opublikowana → 409; zadanie na koncie w toku → 409', async () => {
    const t = zbuduj();
    await expect(t.svc.uruchom('u1', 'u1', ID, { domena: 'inna.pl', tryb: 'podglad' })).rejects.toBeInstanceOf(ConflictException);
    await expect(t.svc.uruchom('u1', 'u1', ID, { domena: '../x', tryb: 'podglad' })).rejects.toBeInstanceOf(BadRequestException);
    await t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' });
    await expect(t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' })).rejects.toThrow(/jeszcze trwa/);
  });

  it('odpytywanie: zakończone zadanie → podgląd z adresem i panelem; błąd → komunikat skryptu dla klienta', async () => {
    const t = zbuduj();
    await t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' });
    const klucz = (t.zadania[0]!.payload as Rek).klucz;
    t.zadania[0]!.status = 'COMPLETED';
    const s = await t.svc.stan('u1', ID);
    expect(s.wordpress).toMatchObject({ stan: 'PODGLAD', adresPodgladu: `https://x.pl/.verris-wp-podglad/${klucz}/`, adresPanelu: `https://x.pl/.verris-wp-podglad/${klucz}/wp-admin/` });
    expect(s.wordpress!.podgladAt).toBeInstanceOf(Date);

    const b = zbuduj();
    await b.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' });
    Object.assign(b.zadania[0]!, { status: 'FAILED', errorMessage: '[kreator-wp] BŁĄD: Brak katalogu strony — sprawdź, czy domena jest dodana do usługi. [verris-task-run] Task x FAILED', outputLog: null });
    const sb = await b.svc.stan('u1', ID);
    expect(sb.wordpress).toMatchObject({ stan: 'BLAD', bladEtap: 'podglad', blad: expect.stringMatching(/^Instalacja podglądu WordPressa nie powiodła się\. Brak katalogu strony/) });
    expect(sb.wordpress!.blad).not.toContain('verris-task-run');
    // Po błędzie można zainstalować podgląd od nowa (nowy klucz katalogu).
    await b.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' });
    expect((b.zadania[1]!.payload as Rek).klucz).not.toBe((b.zadania[0]!.payload as Rek).klucz);
  });

  it('zamiana: tylko po gotowym podglądzie; do kopii idą wpisy strony z kreatora i znacznik (pliki klienta zostają); błąd węzła → z powrotem podgląd', async () => {
    const t = zbuduj();
    await expect(t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'zamiana' })).rejects.toThrow(/Najpierw zainstaluj/);
    await t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' });
    t.zadania[0]!.status = 'COMPLETED';
    const w = await t.svc.uruchom('u1', 'actor', ID, { domena: 'x.pl', tryb: 'zamiana' });
    const p = t.zadania[1]!.payload as Rek;
    expect(p).toMatchObject({ tryb: 'zamiana', daUser: 'klient1', domain: 'x.pl', dir: 'domains/x.pl/public_html', klucz: (t.zadania[0]!.payload as Rek).klucz });
    expect(String(p.pliki).split(',').sort()).toEqual(['.verris-kreator.json', '404.html', 'assets', 'index.html', 'o-nas']);
    expect(p.kopia).toMatch(/^\.verris-kopia-\d{8}-\d{4}$/);
    expect(p).not.toHaveProperty('adminPass');
    expect(w).toMatchObject({ stan: 'ZAMIANA_W_TOKU', kopia: p.kopia });
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_KREATOR_WP_ZAMIANA' }));

    Object.assign(t.zadania[1]!, { status: 'FAILED', errorMessage: '[kreator-wp] BŁĄD: W katalogu strony jest już „wp-login.php” (nie należy do strony z kreatora) — usuń go albo przenieś i spróbuj ponownie.' });
    const s = await t.svc.stan('u1', ID);
    expect(s.wordpress).toMatchObject({ stan: 'PODGLAD', bladEtap: 'zamiana', kopia: null, blad: expect.stringMatching(/strona z kreatora została na domenie.*wp-login\.php/) });
  });

  it('zamiana bez strony z kreatora w katalogu (znacznik innej strony) → 409 bez zadania', async () => {
    const t = zbuduj();
    await t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' });
    t.zadania[0]!.status = 'COMPLETED';
    t.pk.katalogi.get(PUB)!.set('.verris-kreator.json', { type: 'file', dane: Buffer.from(JSON.stringify({ stronaId: '33333333-3333-4333-8333-333333333333', pliki: ['index.html'], at: '' })) });
    await expect(t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'zamiana' })).rejects.toThrow(/nie ma już tej strony z kreatora/);
    expect(t.zadania).toHaveLength(1);
  });

  it('po zamianie: strona przeniesiona, cofnięcie w okresie kopii (zadanie z kopią strony i katalogiem na WordPressa), po okresie → 409', async () => {
    const t = zbuduj();
    await t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' });
    t.zadania[0]!.status = 'COMPLETED';
    await t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'zamiana' });
    const kopia = (t.zadania[1]!.payload as Rek).kopia as string;
    t.zadania[1]!.status = 'COMPLETED';
    const s = await t.svc.stan('u1', ID);
    expect(s.wordpress).toMatchObject({ stan: 'PRZENIESIONA', adresPodgladu: null, adresPanelu: 'https://x.pl/wp-admin/' });
    expect(s.wordpress!.cofnijDo!.getTime() - s.wordpress!.przeniesionaAt!.getTime()).toBe(OKRES_COFNIECIA_DNI * 86_400_000);
    await expect(t.svc.uruchom('u1', 'u1', ID, { domena: 'x.pl', tryb: 'podglad' })).rejects.toThrow(/już działa w WordPressie/);

    // kopia musi być na koncie
    await expect(t.svc.cofnij('u1', 'u1', ID)).rejects.toThrow(/Kopii strony z kreatora nie ma/);
    t.pk.katalogi.get('/domains/x.pl')!.set(kopia, { type: 'dir' });
    const w = await t.svc.cofnij('u1', 'actor', ID);
    expect(t.zadania[2]!.payload).toMatchObject({ tryb: 'cofnij', kopia, kopiaWp: expect.stringMatching(/^\.verris-wordpress-\d{8}-\d{4}$/), dir: 'domains/x.pl/public_html' });
    expect(w.stan).toBe('COFANIE_W_TOKU');
    t.zadania[2]!.status = 'COMPLETED';
    expect((await t.svc.stan('u1', ID)).wordpress).toMatchObject({ stan: 'COFNIETA', cofnijDo: null });

    const p = zbuduj();
    p.ustawCms({ id: 'cms1', stronaId: ID, stan: 'PRZENIESIONA', kopia, domena: 'x.pl', subskrypcjaId: 'sub1', katalog: PUB, klucz: 'a'.repeat(24), przeniesionaAt: new Date(Date.now() - (OKRES_COFNIECIA_DNI + 1) * 86_400_000) });
    await expect(p.svc.cofnij('u1', 'u1', ID)).rejects.toThrow(/ten czas minął/);
  });
});
