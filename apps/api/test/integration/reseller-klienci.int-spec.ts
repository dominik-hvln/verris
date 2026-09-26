import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { ResellerKlienciService } from '../../src/reseller/reseller-klienci.service.js';
import { ResellerPrzypomnienieScheduler } from '../../src/reseller/reseller-przypomnienie.scheduler.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * O-05 — działania resellera na kontach klientów, na prawdziwej bazie.
 *
 * Sedno to granice: reseller widzi tylko usługi i ich stan, działa tylko na
 * własnych klientach i zdejmuje tylko własną blokadę. Zawieszenie idzie przez
 * atrapę SubscriptionsService, która zapisuje zdarzenie jak prawdziwa — bez
 * DirectAdmina (w teście usługa nie ma konta na węźle).
 */

const maile: { to: string; subject: string }[] = [];
const mailer = { send: async (m: { to: string; subject: string }) => { maile.push(m); return {}; } };

const subs = {
  async suspend(o: { subscriptionId: string; reason: string }) {
    await prisma().subscription.update({ where: { id: o.subscriptionId }, data: { status: SubscriptionStatus.SUSPENDED } });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: o.subscriptionId, type: 'SUSPENDED', details: { reason: o.reason } } });
  },
  async unsuspend(o: { subscriptionId: string }) {
    await prisma().subscription.update({ where: { id: o.subscriptionId }, data: { status: SubscriptionStatus.ACTIVE } });
  },
};

function serwis() {
  const p = prisma() as never;
  return new ResellerKlienciService(p, new AuditService(p), mailer as never, subs as never);
}

let n = 0;
async function uzytkownik(extra: Record<string, unknown> = {}) {
  n += 1;
  return prisma().user.create({
    data: { email: `o05-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 123.45, companyName: 'Firma Klienta', nip: '5260250274', ...extra },
  });
}

async function uklad() {
  const reseller = await uzytkownik();
  await prisma().resellerProfile.create({ data: { userId: reseller.id, brandName: 'Studio Nowak', markupPct: 20, status: 'ACTIVE', code: `rsl_t${n}${Date.now() % 100000}` } });
  const klient = await uzytkownik({ resellerOwnerId: reseller.id });
  const plan = await utworzPlan();
  const usluga = await prisma().subscription.create({
    data: { userId: klient.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN' } as never,
  });
  return { reseller, klient, usluga };
}

describe('O-05 — reseller na kontach swoich klientów', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    maile.length = 0;
  });
  afterAll(rozlacz);

  it('szczegóły klienta: tylko usługi i stan — żadnego salda, NIP-u ani danych rozliczeniowych', async () => {
    const { reseller, klient } = await uklad();
    const k = await serwis().szczegoly(reseller.id, klient.id);
    expect(Object.keys(k).sort()).toEqual(['email', 'id', 'imieNazwisko', 'od', 'uslugi']);
    expect(Object.keys(k.uslugi[0]).sort()).toEqual(
      ['cenaDetaliczna', 'domena', 'id', 'odnowienie', 'plan', 'status', 'waluta', 'wstrzymanaPrzezCiebie', 'zdrowie'],
    );
    const json = JSON.stringify(k);
    expect(json).not.toContain('123.45');
    expect(json).not.toContain('5260250274');
    expect(json).not.toContain('Firma Klienta');
    expect(k.uslugi[0].cenaDetaliczna).toBe(54);
  });

  it('cudzy klient wygląda jak nieistniejący (404), także przy działaniach', async () => {
    const a = await uklad();
    const b = await uklad();
    await expect(serwis().szczegoly(a.reseller.id, b.klient.id)).rejects.toMatchObject({ status: 404 });
    await expect(serwis().wstrzymaj(a.reseller.id, b.klient.id, b.usluga.id)).rejects.toMatchObject({ status: 404 });
    await expect(serwis().odepnij(a.reseller.id, b.klient.id)).rejects.toMatchObject({ status: 404 });
  });

  it('wstrzymanie i wznowienie: klient dostaje maile, reseller zdejmuje tylko własną blokadę', async () => {
    const { reseller, klient, usluga } = await uklad();
    const po = await serwis().wstrzymaj(reseller.id, klient.id, usluga.id);
    expect(po.uslugi[0]).toMatchObject({ status: 'SUSPENDED', wstrzymanaPrzezCiebie: true });
    expect(maile.map((m) => m.to)).toEqual([klient.email]);

    await serwis().wznow(reseller.id, klient.id, usluga.id);
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: usluga.id } })).status).toBe('ACTIVE');

    // Blokada za płatność: reseller jej nie zdejmie.
    await subs.suspend({ subscriptionId: usluga.id, reason: 'GRACE_EXPIRED' });
    await expect(serwis().wznow(reseller.id, klient.id, usluga.id)).rejects.toMatchObject({ status: 403 });
  });

  it('link „ustaw hasło”: stary token przestaje działać, drugi w ciągu 10 min odmowa', async () => {
    const { reseller, klient } = await uklad();
    await serwis().linkHasla(reseller.id, klient.id);
    await expect(serwis().linkHasla(reseller.id, klient.id)).rejects.toMatchObject({ status: 429 });
    const tokeny = await prisma().userAuthToken.findMany({ where: { userId: klient.id, purpose: 'PASSWORD_RESET' } });
    expect(tokeny.filter((t) => t.usedAt === null)).toHaveLength(1);
    expect(maile).toHaveLength(1);
  });

  it('odpięcie przez resellera i przez klienta — konto zostaje, znika tylko przypisanie', async () => {
    const a = await uklad();
    await serwis().odepnij(a.reseller.id, a.klient.id);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: a.klient.id } })).resellerOwnerId).toBeNull();
    expect(await prisma().subscription.count({ where: { userId: a.klient.id } })).toBe(1);

    const b = await uklad();
    expect(await serwis().partnerKlienta(b.klient.id)).toMatchObject({ nazwa: 'Studio Nowak', logoUrl: null });
    await serwis().odepnijSie(b.klient.id);
    expect(await serwis().partnerKlienta(b.klient.id)).toBeNull();
    expect(maile.at(-1)?.to).toBe(b.reseller.email);
  });

  it('wstrzymanie przez resellera > 30 dni: jedno przypomnienie dla obsługi na usługę', async () => {
    const { reseller, klient, usluga } = await uklad();
    await serwis().wstrzymaj(reseller.id, klient.id, usluga.id);
    await uzytkownik({ role: 'ADMIN' });
    const powiadomienia: unknown[] = [];
    const s = new ResellerPrzypomnienieScheduler(prisma() as never, { create: async (n: unknown) => { powiadomienia.push(n); } } as never);
    expect(await s.sprawdz()).toBe(0);
    const zaMiesiac = new Date(Date.now() + 31 * 24 * 3600 * 1000);
    expect(await s.sprawdz(zaMiesiac)).toBe(1);
    expect(powiadomienia).toHaveLength(1);
    expect(await s.sprawdz(zaMiesiac)).toBe(0);
    void klient;
  });
});
