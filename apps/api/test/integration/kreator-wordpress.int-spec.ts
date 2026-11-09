import { PRZYKLAD_SALON } from '@verris/kreator';
import { KreatorPublikacjaService } from '../../src/kreator/publikacja.service.js';
import { fabrykaRendereraPublikacji } from '../../src/kreator/renderer-publikacji.js';
import { KreatorWordpressService } from '../../src/kreator/wordpress/kreator-wordpress.service.js';
import type { PlikiHostingu, SesjaPlikow } from '../../src/kreator/pliki-hostingu.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Paczka 124 – przejście strony z kreatora na WordPressa na prawdziwym Postgresie (migracja 20261109140000_kreator_cms):
 * zadanie węzła KREATOR_WP (nowa wartość enum) z danymi dla agenta, stan KreatorCms (jeden na stronę, kasowany razem
 * ze stroną), przejścia stanu po zakończeniu zadania i blokada publikacji z kreatora po zamianie. Pliki konta,
 * panel serwera i fonty – atrapy.
 */
const KLUCZ = 'k'.repeat(48);

function sesja(): SesjaPlikow {
  const katalogi = new Map<string, Map<string, { type: 'file' | 'dir'; tresc?: string }>>([
    ['/domains/x.pl', new Map([['public_html', { type: 'dir' as const }]])],
    ['/domains/x.pl/public_html', new Map<string, { type: 'file' | 'dir'; tresc?: string }>([['index.html', { type: 'file' }]])],
  ]);
  return {
    katalogDomeny: async () => ({ katalog: '/domains/x.pl/public_html', katalogDomeny: '/domains/x.pl', chronione: [] }),
    lista: async (k) => [...(katalogi.get(k) ?? new Map()).entries()].map(([name, w]) => ({ name, type: w.type })),
    czytaj: async (s) => katalogi.get(s.slice(0, s.lastIndexOf('/')))?.get(s.slice(s.lastIndexOf('/') + 1))?.tresc ?? null,
    zapiszTekst: async (k, n, t) => void katalogi.get(k)?.set(n, { type: 'file', tresc: t }),
    wgraj: async (k, n) => void katalogi.get(k)?.set(n, { type: 'file' }),
    utworzKatalog: async (k, n) => {
      katalogi.get(k)?.set(n, { type: 'dir' });
      katalogi.set(`${k}/${n}`, new Map());
    },
    przenies: async () => undefined,
    usun: async () => undefined,
  };
}

async function przygotuj() {
  const wezel = await utworzWezel();
  const plan = await utworzPlan();
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, status: 'ACTIVE' });
  await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE', isTrial: false } });
  const strona = await prisma().kreatorStrona.create({
    data: {
      userId: k.user.id, nazwa: 'Salon', model: PRZYKLAD_SALON as object, wersjaModelu: 1, odcisk: 'x', status: 'GOTOWA',
      opublikowanaAt: new Date(), domena: 'x.pl', adres: 'https://x.pl/', katalog: '/domains/x.pl/public_html', subskrypcjaId: k.subscription.id,
    },
  });
  const se = sesja();
  await se.zapiszTekst('/domains/x.pl/public_html', '.verris-kreator.json', JSON.stringify({ stronaId: strona.id, pliki: ['index.html'], at: '' }));
  const hosting: PlikiHostingu = { domenyKlienta: async () => [{ domena: 'x.pl', subskrypcjaId: k.subscription.id }], sesja: async () => se };
  const config = { get: (n: string) => (n === 'appKmsKey' ? KLUCZ : n === 'PUBLIC_API_URL' ? 'https://api.verris.test' : undefined) };
  const kreator = { dostep: async () => ({ dostep: true, wersja: 'hosting' }) };
  const audit = { record: vi.fn(async () => undefined) };
  const fonty = { plikKreatora: vi.fn(async (n: string) => ({ buf: Buffer.from(n), type: 'font/woff2' })) };
  const da = { getClientForHostingAccount: async () => ({ createMysqlDatabase: async ({ name }: { name: string }) => ({ database: `u_${name}`, username: `u_${name}` }) }) };
  const wp = new KreatorWordpressService(prisma() as never, config as never, kreator as never, audit as never, da as never, fonty as never, hosting);
  const publikacja = new KreatorPublikacjaService(prisma() as never, config as never, kreator as never, audit as never, fonty as never, hosting, fabrykaRendereraPublikacji());
  return { k, strona, wp, publikacja, wezel };
}

describe('Verris Kreator – przejście na WordPressa (baza)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().$executeRawUnsafe('TRUNCATE TABLE "KreatorStrona", "KreatorWersja", "KreatorCms" CASCADE;');
  });
  afterAll(rozlacz);

  it('podgląd → zadanie KREATOR_WP w kolejce węzła konta, po wykonaniu stan PODGLAD; zamiana → PRZENIESIONA i publikacja zablokowana', async () => {
    const t = await przygotuj();
    await t.wp.uruchom(t.k.user.id, t.k.user.id, t.strona.id, { domena: 'x.pl', tryb: 'podglad' });
    const z1 = await prisma().nodeTask.findFirstOrThrow({ where: { accountId: t.k.account.id } });
    expect(z1).toMatchObject({ kind: 'KREATOR_WP', status: 'QUEUED', serverId: t.wezel.id });
    expect(z1.payload).toMatchObject({ tryb: 'podglad', daUser: t.k.account.daUsername, domain: 'x.pl', dir: 'domains/x.pl/public_html' });
    const cms = await prisma().kreatorCms.findUniqueOrThrow({ where: { stronaId: t.strona.id } });
    expect(cms).toMatchObject({ stan: 'PODGLAD_W_TOKU', zadanieId: z1.id, cel: 'wordpress', userId: t.k.user.id });

    await prisma().nodeTask.update({ where: { id: z1.id }, data: { status: 'COMPLETED' } });
    expect((await t.wp.stan(t.k.user.id, t.strona.id)).wordpress).toMatchObject({ stan: 'PODGLAD' });

    await t.wp.uruchom(t.k.user.id, t.k.user.id, t.strona.id, { domena: 'x.pl', tryb: 'zamiana' });
    const z2 = await prisma().nodeTask.findFirstOrThrow({ where: { accountId: t.k.account.id, id: { not: z1.id } } });
    expect(z2.payload).toMatchObject({ tryb: 'zamiana', pliki: 'index.html,.verris-kreator.json' });
    await prisma().nodeTask.update({ where: { id: z2.id }, data: { status: 'COMPLETED' } });
    expect((await t.wp.stan(t.k.user.id, t.strona.id)).wordpress).toMatchObject({ stan: 'PRZENIESIONA' });

    await expect(t.publikacja.publikuj(t.k.user.id, t.k.user.id, t.strona.id, { domena: 'x.pl' })).rejects.toThrow(/działa już w WordPressie/);
    await expect(t.publikacja.stan(t.k.user.id, t.strona.id)).resolves.toMatchObject({ mozliwa: false });
  });

  it('dwa równoległe odpytania po zakończeniu zadania – jedno przejście stanu; usunięcie strony kasuje stan przejścia', async () => {
    const t = await przygotuj();
    await t.wp.uruchom(t.k.user.id, t.k.user.id, t.strona.id, { domena: 'x.pl', tryb: 'podglad' });
    const z = await prisma().nodeTask.findFirstOrThrow({ where: { accountId: t.k.account.id } });
    await prisma().nodeTask.update({ where: { id: z.id }, data: { status: 'FAILED', errorMessage: '[kreator-wp] BŁĄD: Brak paczki strony na koncie.' } });
    const [a, b] = await Promise.all([t.wp.stan(t.k.user.id, t.strona.id), t.wp.stan(t.k.user.id, t.strona.id)]);
    expect(a.wordpress).toMatchObject({ stan: 'BLAD', blad: expect.stringMatching(/Brak paczki strony na koncie/) });
    expect(b.wordpress).toMatchObject({ stan: 'BLAD' });
    await prisma().kreatorStrona.delete({ where: { id: t.strona.id } });
    expect(await prisma().kreatorCms.count()).toBe(0);
  });
});
