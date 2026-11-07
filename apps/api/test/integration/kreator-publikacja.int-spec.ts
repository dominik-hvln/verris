import { NotFoundException } from '@nestjs/common';
import { PRZYKLAD_SALON } from '@verris/kreator';
import { KreatorPublikacjaService } from '../../src/kreator/publikacja.service.js';
import { PlikiHostinguDa, type PlikiHostingu, type SesjaPlikow } from '../../src/kreator/pliki-hostingu.js';
import { fabrykaRendereraPublikacji } from '../../src/kreator/renderer-publikacji.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Paczka 121 – publikacja kreatora na prawdziwym Postgresie (migracja 20261108130000_kreator_publikacja):
 * domeny do publikacji tylko z opłaconych, działających usług hostingu z aktywnym kontem (relacje usługa → plan,
 * usługa → konto), blokada równoległej publikacji w kolumnie publikacjaOd (także przerwana – po 15 min),
 * link podglądu z terminem w podgladDo. Serwer plików i węzeł – atrapy.
 */
const KLUCZ = 'k'.repeat(48);

async function usluga(opts: { trial?: boolean; konto?: 'ACTIVE' | 'SUSPENDED'; status?: 'ACTIVE' | 'CANCELED' } = {}) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan();
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id, status: opts.konto ?? 'ACTIVE' });
  await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: opts.status ?? 'ACTIVE', isTrial: opts.trial ?? false } });
  return k;
}

function daAtrapa() {
  return {
    listHostingDomainsForSubscription: vi.fn(async (subId: string) => ({ domains: [{ name: `d-${subId.slice(0, 6)}.pl` }], fetchError: null })),
    getClientForServer: vi.fn(async () => ({ asUser: () => ({}) })),
  };
}

function serwis(hosting: PlikiHostingu, wersja: 'proba' | 'hosting' = 'hosting') {
  const config = { get: (k: string) => (k === 'appKmsKey' ? KLUCZ : k === 'PUBLIC_API_URL' ? 'https://api.verris.test' : undefined) };
  const fonty = { plikKreatora: vi.fn(async (n: string) => ({ buf: Buffer.from(n), type: 'font/woff2' })) };
  return new KreatorPublikacjaService(
    prisma() as never, config as never, { dostep: async () => ({ dostep: true, wersja }) } as never,
    { record: vi.fn(async () => undefined) } as never, fonty as never, hosting, fabrykaRendereraPublikacji(),
  );
}

describe('Verris Kreator – publikacja (baza)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().$executeRawUnsafe('TRUNCATE TABLE "KreatorStrona", "KreatorWersja" CASCADE;');
  });
  afterAll(rozlacz);

  it('domeny do publikacji: tylko opłacone, działające usługi hostingu z aktywnym kontem, tylko własne', async () => {
    const platna = await usluga();
    const proba = await usluga({ trial: true });
    const zawieszone = await usluga({ konto: 'SUSPENDED' });
    const anulowana = await usluga({ status: 'CANCELED' });
    // Wszystkie usługi przepinamy na jednego klienta – liczy się usługa, nie konto użytkownika.
    for (const k of [proba, zawieszone, anulowana]) {
      await prisma().subscription.update({ where: { id: k.subscription.id }, data: { userId: platna.user.id } });
      await prisma().account.update({ where: { id: k.account.id }, data: { userId: platna.user.id } });
    }
    const da = daAtrapa();
    const p = new PlikiHostinguDa(prisma() as never, da as never);
    const domeny = await p.domenyKlienta(platna.user.id);
    expect(domeny.map((d) => d.subskrypcjaId)).toEqual([platna.subscription.id]);
    expect(await p.domenyKlienta(proba.user.id)).toEqual([]);
    await expect(p.sesja(platna.user.id, proba.subscription.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(p.sesja(proba.user.id, platna.subscription.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(p.sesja(platna.user.id, platna.subscription.id)).resolves.toBeTruthy();
  });

  it('blokada publikacji w bazie: druga równoległa → 409, przerwana (> 15 min) nie blokuje; link podglądu z terminem w podgladDo', async () => {
    const k = await usluga();
    const strona = await prisma().kreatorStrona.create({
      data: { userId: k.user.id, nazwa: 'Salon', model: PRZYKLAD_SALON as never, wersjaModelu: 1, odcisk: '', status: 'GOTOWA' },
    });
    let pusc!: () => void;
    let czekaj = new Promise<void>((r) => (pusc = r));
    const sesja = { katalogDomeny: async () => { await czekaj; throw new Error('koniec testu'); } } as unknown as SesjaPlikow;
    const hosting: PlikiHostingu = {
      domenyKlienta: async () => [{ domena: 'x.pl', subskrypcjaId: k.subscription.id }],
      sesja: async () => sesja,
    };
    const a = serwis(hosting);
    const b = serwis(hosting); // druga replika API – osobna pamięć, wspólna baza
    const pierwsza = a.publikuj(k.user.id, k.user.id, strona.id, { domena: 'x.pl' }).catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 200));
    expect((await prisma().kreatorStrona.findUniqueOrThrow({ where: { id: strona.id } })).publikacjaOd).toBeInstanceOf(Date);
    await expect(b.publikuj(k.user.id, k.user.id, strona.id, { domena: 'x.pl' })).rejects.toThrow(/już trwa/);
    pusc();
    expect(await pierwsza).toBeInstanceOf(Error);
    expect((await prisma().kreatorStrona.findUniqueOrThrow({ where: { id: strona.id } })).publikacjaOd).toBeNull();

    // Przerwana publikacja (restart API) – po 15 min nie blokuje.
    czekaj = new Promise<void>((r) => (pusc = r));
    await prisma().kreatorStrona.update({ where: { id: strona.id }, data: { publikacjaOd: new Date(Date.now() - 16 * 60_000) } });
    const druga = b.publikuj(k.user.id, k.user.id, strona.id, { domena: 'x.pl' }).catch((e: unknown) => e);
    await new Promise((r) => setTimeout(r, 200));
    expect((await prisma().kreatorStrona.findUniqueOrThrow({ where: { id: strona.id } })).publikacjaOd!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    pusc();
    await druga;

    const p = serwis(hosting, 'proba');
    const link = await p.publikuj(k.user.id, k.user.id, strona.id, {});
    const zapis = await prisma().kreatorStrona.findUniqueOrThrow({ where: { id: strona.id } });
    expect(zapis.podgladDo?.toISOString()).toBe((link as { wazneDo: Date }).wazneDo.toISOString());
    const token = /\/p\/([0-9a-z]+)\//.exec(link.adres)![1];
    expect((await p.stronaLinku(token, '')).status).toBe(200);
    await prisma().kreatorStrona.delete({ where: { id: strona.id } });
    expect((await p.stronaLinku(token, '')).status).toBe(404);
  });
});
