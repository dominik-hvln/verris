import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { CyklZyciaUslugiService } from '../../src/subscriptions/cykl-zycia-uslugi.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * F3.5 — cykl życia usługi na prawdziwej bazie: anulowana na koniec okresu nie odnawia się (także w oknie
 * odnowienia przed końcem okresu) i kończy się z jego końcem; anulacja i cofnięcie przez operatora (z kartą — najpierw
 * system płatności), zmiana daty odnowienia, obietnica zapłaty wstrzymująca zawieszenie. Atrapy: węzeł i Stripe.
 */

const zakonczone: string[] = [];
const zawieszone: string[] = [];
const subs = {
  finalizeScheduledCancellation: async (id: string) => {
    zakonczone.push(id);
    return null;
  },
  suspend: async (o: { subscriptionId: string; reason: string }) => {
    zawieszone.push(o.subscriptionId);
    await prisma().subscription.update({ where: { id: o.subscriptionId }, data: { status: SubscriptionStatus.SUSPENDED } });
  },
  unsuspend: async () => undefined,
};
const eco = { safeAward: () => undefined, awardSubscriptionRenewal: async () => undefined };

function scheduler() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const promo = new PromoService(p, ledger, audit, { send: async () => ({}) } as never, { get: () => undefined } as never);
  return new RenewalScheduler(p, ledger, subs as never, audit, promo, eco as never);
}

let n = 0;
async function klient(saldo: number) {
  n += 1;
  return prisma().user.create({ data: { email: `f35-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
}
async function usluga(userId: string, extra: Record<string, unknown> = {}) {
  const plan = await utworzPlan();
  return prisma().subscription.create({
    data: {
      userId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN',
      paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 29 * 86400000), currentPeriodEnd: new Date(Date.now() + 12 * 3600000),
      ...extra,
    } as never,
  });
}
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const sub = (id: string) => prisma().subscription.findUniqueOrThrow({ where: { id } });
const obecny = async (id: string) => (await sub(id)).currentPeriodEnd ?? new Date(0);

describe('F3.5 — anulacja na koniec okresu w harmonogramie odnowień', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zakonczone.length = 0;
    zawieszone.length = 0;
  });
  afterAll(rozlacz);

  it('anulowana na koniec okresu: w oknie odnowienia (12 h przed końcem) bez obciążenia i bez przesunięcia okresu', async () => {
    const k = await klient(100);
    const koniec = new Date(Date.now() + 12 * 3600000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec, cancelAt: koniec });
    await scheduler().handleHourlyTick();
    expect(await saldo(k.id)).toBe(100);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(0);
    const po = await sub(u.id);
    expect(po.currentPeriodEnd?.toISOString()).toBe(koniec.toISOString());
    expect(po.status).toBe('ACTIVE');
    expect(zakonczone).toEqual([]);
  });

  it('po końcu okresu harmonogram kończy anulowaną usługę (portfel), a kartową zostawia webhookowi', async () => {
    const k = await klient(100);
    const minal = new Date(Date.now() - 60000);
    const portfel = await usluga(k.id, { currentPeriodEnd: minal, cancelAt: minal });
    await usluga(k.id, { currentPeriodEnd: minal, cancelAt: minal, paymentSource: 'STRIPE_CARD', stripeSubscriptionId: `sub_f35_${Date.now()}` });
    await scheduler().handleHourlyTick();
    expect(zakonczone).toEqual([portfel.id]);
    expect(await saldo(k.id)).toBe(100);
  });
});

// ── operator: CyklZyciaUslugiService ─────────────────────────────────────────

const stripeWywolania: string[] = [];
let stripePada = false;
const stripe = {
  cancelSubscription: async (id: string, o: { atPeriodEnd?: boolean }) => {
    if (stripePada) throw new Error('stripe 500');
    stripeWywolania.push(`cancel:${id}:${o.atPeriodEnd}`);
  },
  cofnijAnulacjeSubskrypcji: async (id: string) => {
    if (stripePada) throw new Error('stripe 500');
    stripeWywolania.push(`cofnij:${id}`);
  },
};
const cykl = () => new CyklZyciaUslugiService(prisma() as never, new AuditService(prisma() as never), stripe as never);
async function operator(role: 'STAFF' | 'ADMIN' = 'STAFF') {
  n += 1;
  const u = await prisma().user.create({ data: { email: `f35-op-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', role } });
  return { userId: u.id, role };
}
const POWOD = 'Klient prosi w zgłoszeniu o rezygnację.';
const aktywnosc = (userId: string) =>
  new UsersService(prisma() as never, {} as never, {} as never, {} as never, {} as never, {} as never).listMyActivity(userId);

describe('F3.5 — cykl życia usługi zmieniany przez operatora', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zakonczone.length = 0;
    zawieszone.length = 0;
    stripeWywolania.length = 0;
    stripePada = false;
  });
  afterAll(rozlacz);

  it('anulacja na koniec okresu (portfel): cancelAt = koniec okresu, idempotentnie; harmonogram nie obciąża; cofnięcie przywraca odnowienie', async () => {
    const op = await operator();
    const k = await klient(100);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'Rezygnacja', message: 'Proszę o rezygnację' } });

    // Powód obowiązkowy; zgłoszenie musi być klienta.
    await expect(cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: 'krótki' })).rejects.toMatchObject({ status: 400 });
    const r = await cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD, zgloszenie: `#${zgl.id.slice(0, 8)}` });
    expect(r).toMatchObject({ bezZmian: false, cancelAt: koniec.toISOString() });
    expect((await sub(u.id)).cancelAt?.toISOString()).toBe(koniec.toISOString());
    expect(await cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: true });
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'CANCEL_SCHEDULED' } })).toBe(1);
    expect(stripeWywolania).toEqual([]);

    // D3 — klient widzi „obsługa Verris (zgłoszenie #…)”; zdarzenie usługi bez powodu i bez id pracownika.
    const e = (await aktywnosc(k.id)).events.find((x) => x.action === 'SUBSCRIPTION_CANCEL_SCHEDULED');
    expect(e).toMatchObject({ actor: `obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})` });
    const zd = await prisma().subscriptionEvent.findFirstOrThrow({ where: { subscriptionId: u.id, type: 'CANCEL_SCHEDULED' } });
    expect(JSON.stringify(zd.details)).not.toContain(op.userId);
    expect(JSON.stringify(zd.details)).not.toContain('zgłoszeniu');
    const dziennik = await prisma().auditLog.findFirstOrThrow({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.id } });
    expect(dziennik).toMatchObject({ actorUserId: op.userId, details: expect.objectContaining({ akcja: 'anulacja-na-koniec-okresu', powod: POWOD, zgloszenieId: zgl.id }) });

    // Cofnięcie: cancelAt znika, drugi raz — bez zmian.
    expect(await cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: false });
    expect((await sub(u.id)).cancelAt).toBeNull();
    expect(await cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: true });
    expect((await aktywnosc(k.id)).events.some((x) => x.action === 'SUBSCRIPTION_CANCEL_REVOKED')).toBe(true);
  });

  it('kartą (Stripe): najpierw system płatności; jego błąd = nic nie zmienione; STAFF nie rusza usług konta zespołu', async () => {
    const op = await operator();
    const k = await klient(0);
    const stripeId = `sub_f35_${Date.now()}`;
    const u = await usluga(k.id, { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: stripeId, currentPeriodEnd: new Date(Date.now() + 5 * 86400000) });
    stripePada = true;
    await expect(cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD })).rejects.toMatchObject({ status: 409 });
    expect((await sub(u.id)).cancelAt).toBeNull();
    stripePada = false;
    await cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD });
    stripePada = true;
    await expect(cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD })).rejects.toMatchObject({ status: 409 });
    expect((await sub(u.id)).cancelAt).not.toBeNull();
    stripePada = false;
    await cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD });
    expect(stripeWywolania).toEqual([`cancel:${stripeId}:true`, `cofnij:${stripeId}`]);
    // Data odnowienia usługi kartą cykliczną — odmowa (do decyzji właściciela).
    await expect(
      cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: new Date(Date.now() + 20 * 86400000) }),
    ).rejects.toMatchObject({ status: 400 });

    const zespol = await prisma().user.create({ data: { email: `f35-zespol-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const uz = await usluga(zespol.id, { currentPeriodEnd: new Date(Date.now() + 5 * 86400000) });
    await expect(cykl().anulujNaKoniecOkresu({ subscriptionId: uz.id, operator: op, powod: POWOD })).rejects.toMatchObject({ status: 403 });
    await expect(cykl().anulujNaKoniecOkresu({ subscriptionId: uz.id, operator: await operator('ADMIN'), powod: POWOD })).resolves.toMatchObject({ bezZmian: false });
  });

  it('data odnowienia: przedłużenie gratis bez obciążenia; skrócenie tylko ze zgłoszeniem klienta; nie w oknie odnowienia; anulowana — najpierw cofnij', async () => {
    const op = await operator('ADMIN');
    const k = await klient(100);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    const nowa = new Date(koniec.getTime() + 14 * 86400000);
    expect(await cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: nowa })).toMatchObject({ bezZmian: false, dni: 14 });
    expect((await sub(u.id)).currentPeriodEnd?.toISOString()).toBe(nowa.toISOString());
    expect(await cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: nowa })).toMatchObject({ bezZmian: true });
    expect(await saldo(k.id)).toBe(100);
    expect((await aktywnosc(k.id)).events.some((x) => x.action === 'SUBSCRIPTION_RENEWAL_DATE_CHANGED')).toBe(true);

    // Skrócenie bez zgłoszenia — 400; ze zgłoszeniem klienta — tak.
    const krocej = new Date(Date.now() + 5 * 86400000);
    await expect(cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: krocej })).rejects.toMatchObject({ status: 400 });
    // Audyt Fali 3 — zgłoszenie założone przez obsługę „w imieniu” klienta to nie jego prośba: 403, okres bez zmian.
    const wImieniu = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'OBSLUGA', openedByStaffId: op.userId, subject: 'Wyrównanie dat', message: 'x' } });
    await expect(cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: krocej, zgloszenie: wImieniu.id })).rejects.toMatchObject({ status: 403 });
    expect((await sub(u.id)).currentPeriodEnd?.toISOString()).toBe(nowa.toISOString());
    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'Wyrównanie dat', message: 'x' } });
    await cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: krocej, zgloszenie: zgl.id });
    expect((await sub(u.id)).currentPeriodEnd?.toISOString()).toBe(krocej.toISOString());

    // Ponad rok naraz — 400; mniej niż doba od teraz — 400.
    await expect(cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: new Date(krocej.getTime() + 400 * 86400000) })).rejects.toMatchObject({ status: 400 });
    await expect(cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: new Date(Date.now() + 3600000), zgloszenie: zgl.id })).rejects.toMatchObject({ status: 400 });

    // W oknie odnowienia (12 h do końca) — odmowa, żeby nie wejść między obciążenie a przesunięcie okresu.
    const wOknie = await usluga(k.id);
    await expect(cykl().zmienDateOdnowienia({ przed: await obecny(wOknie.id), subscriptionId: wOknie.id, operator: op, powod: POWOD, nowaData: new Date(Date.now() + 30 * 86400000) })).rejects.toMatchObject({ status: 400 });

    // Anulowana na koniec okresu — najpierw cofnięcie.
    await cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD });
    await expect(cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: nowa })).rejects.toMatchObject({ status: 400 });
  });

  it('przegląd F3.5: okres próbny — data odnowienia odmowa (próba kończy się z trialEndsAt, „przedłużenie” byłoby pozorne)', async () => {
    const op = await operator('ADMIN');
    const k = await klient(0);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await usluga(k.id, { isTrial: true, trialEndsAt: koniec, currentPeriodEnd: koniec, priceAmount: 0 });
    await expect(
      cykl().zmienDateOdnowienia({ przed: await obecny(u.id), subscriptionId: u.id, operator: op, powod: POWOD, nowaData: new Date(koniec.getTime() + 14 * 86400000) }),
    ).rejects.toMatchObject({ status: 400 });
    expect((await sub(u.id)).currentPeriodEnd?.toISOString()).toBe(koniec.toISOString());
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'RENEWAL_DATE_CHANGED' } })).toBe(0);
  });

  it('obietnica zapłaty: wstrzymuje zawieszenie zaległej usługi do daty, po dacie normalny cykl; maks. 7 dni; jedna na zaległość dla STAFF', async () => {
    const op = await operator();
    const k = await klient(0);
    const u = await usluga(k.id, { status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: new Date(Date.now() - 3600000) });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: u.id, type: 'PAYMENT_FAILED', createdAt: new Date(Date.now() - 2 * 3600000) } });

    await expect(cykl().ustawObietniceZaplaty({ subscriptionId: u.id, operator: op, powod: POWOD, dni: 8 })).rejects.toMatchObject({ status: 400 });
    const r = await cykl().ustawObietniceZaplaty({ subscriptionId: u.id, operator: op, powod: POWOD, dni: 3 });
    const doKiedy = new Date(r.paymentPromiseUntil);
    expect(doKiedy.getTime()).toBeGreaterThan(Date.now() + 3 * 86400000 - 60000);
    await scheduler().handleHourlyTick();
    expect(zawieszone).toEqual([]);
    expect((await sub(u.id)).status).toBe('PAST_DUE');

    // Druga obietnica w tej samej zaległości — STAFF nie, administrator tak.
    await expect(cykl().ustawObietniceZaplaty({ subscriptionId: u.id, operator: op, powod: POWOD, dni: 7 })).rejects.toMatchObject({ status: 403 });
    await cykl().ustawObietniceZaplaty({ subscriptionId: u.id, operator: await operator('ADMIN'), powod: POWOD, dni: 1 });

    // Po dacie — zawieszenie w najbliższym przebiegu.
    await prisma().subscription.update({ where: { id: u.id }, data: { paymentPromiseUntil: new Date(Date.now() - 60000) } });
    await scheduler().handleHourlyTick();
    expect(zawieszone).toEqual([u.id]);
    // Aktywnej usługi obietnica nie dotyczy.
    const aktywna = await usluga(k.id, { currentPeriodEnd: new Date(Date.now() + 5 * 86400000) });
    await expect(cykl().ustawObietniceZaplaty({ subscriptionId: aktywna.id, operator: op, powod: POWOD, dni: 2 })).rejects.toMatchObject({ status: 400 });
  });

  it('odwołanie obietnicy: zawieszenie wraca do normalnego cyklu', async () => {
    const op = await operator();
    const k = await klient(0);
    const u = await usluga(k.id, { status: SubscriptionStatus.PAST_DUE, currentPeriodEnd: new Date(Date.now() - 3600000) });
    await cykl().ustawObietniceZaplaty({ subscriptionId: u.id, operator: op, powod: POWOD, dni: 2 });
    expect(await cykl().odwolajObietniceZaplaty({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: false });
    expect((await sub(u.id)).paymentPromiseUntil).toBeNull();
    await scheduler().handleHourlyTick();
    expect(zawieszone).toEqual([u.id]);
  });
});

describe('audyt Fali 3 — cofnięcie rezygnacji złożonej przez klienta', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    stripeWywolania.length = 0;
    stripePada = false;
  });
  afterAll(rozlacz);

  async function rezygnacjaKlienta(userId: string, koniec: Date, extra: Record<string, unknown> = {}) {
    const u = await usluga(userId, { currentPeriodEnd: koniec, cancelAt: koniec, ...extra });
    await prisma().subscriptionEvent.create({
      data: { subscriptionId: u.id, type: 'CANCEL_SCHEDULED', details: { actor: userId, source: 'CUSTOMER', effectiveAt: koniec.toISOString() } },
    });
    return u;
  }

  it('STAFF (L2/NOC) bez zgłoszenia klienta — 400 i nic nie zmienione; ze zgłoszeniem klienta albo jako ADMIN — tak', async () => {
    const op = await operator();
    const k = await klient(100);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await rezygnacjaKlienta(k.id, koniec);
    await expect(cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD })).rejects.toMatchObject({ status: 400 });
    expect((await sub(u.id)).cancelAt?.toISOString()).toBe(koniec.toISOString());
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'CANCEL_REVOKED' } })).toBe(0);

    // Zgłoszenie innego klienta nie wystarcza.
    const obcy = await klient(0);
    const obce = await prisma().ticket.create({ data: { userId: obcy.id, zrodlo: 'PANEL', subject: 'x', message: 'x' } });
    await expect(cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD, zgloszenie: obce.id })).rejects.toBeDefined();
    expect((await sub(u.id)).cancelAt).not.toBeNull();

    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'Zostaję', message: 'Jednak zostaję' } });
    expect(await cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD, zgloszenie: zgl.id })).toMatchObject({ bezZmian: false });
    expect((await sub(u.id)).cancelAt).toBeNull();

    const u2 = await rezygnacjaKlienta(k.id, koniec);
    expect(await cykl().cofnijAnulacje({ subscriptionId: u2.id, operator: await operator('ADMIN'), powod: POWOD })).toMatchObject({ bezZmian: false });
  });

  it('rezygnacja bez wpisu źródła (np. z systemu płatności) — jak rezygnacja klienta; kartowa: Stripe nie jest wołany', async () => {
    const op = await operator();
    const k = await klient(0);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec, cancelAt: koniec, paymentSource: 'STRIPE_CARD', stripeSubscriptionId: `sub_f3a_${Date.now()}` });
    await expect(cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD })).rejects.toMatchObject({ status: 400 });
    expect(stripeWywolania).toEqual([]);
  });

  it('przegląd poprawek: anulacja obsługi cofnięta, a potem rezygnacja bez wpisu (system płatności) — liczy się jak klienta, nie wg starego wpisu obsługi', async () => {
    const op = await operator();
    const k = await klient(100);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    await cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD });
    await cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD });
    // Rezygnacja zapisana bez zdarzenia (np. synchronizacja z systemu płatności).
    await prisma().subscription.update({ where: { id: u.id }, data: { cancelAt: koniec } });
    await expect(cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD })).rejects.toMatchObject({ status: 400 });
    expect((await sub(u.id)).cancelAt?.toISOString()).toBe(koniec.toISOString());
  });

  it('w oknie odnowienia (mniej niż doba) rezygnacji klienta nie cofa nikt, także ADMIN ze zgłoszeniem; rezygnację obsługi — tak', async () => {
    const admin = await operator('ADMIN');
    const k = await klient(100);
    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'Zostaję', message: 'x' } });
    const blisko = new Date(Date.now() + 12 * 3600000);
    const u = await rezygnacjaKlienta(k.id, blisko);
    await expect(cykl().cofnijAnulacje({ subscriptionId: u.id, operator: admin, powod: POWOD, zgloszenie: zgl.id })).rejects.toMatchObject({ status: 400 });
    expect((await sub(u.id)).cancelAt).not.toBeNull();

    const op = await operator();
    const u2 = await usluga(k.id, { currentPeriodEnd: blisko, cancelAt: blisko });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: u2.id, type: 'CANCEL_SCHEDULED', details: { source: 'OPERATOR', effectiveAt: blisko.toISOString() } } });
    expect(await cykl().cofnijAnulacje({ subscriptionId: u2.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: false });
  });
});

describe('audyt Fali 3 — data odnowienia z okresem bazowym (odnowienie w międzyczasie)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zakonczone.length = 0;
  });
  afterAll(rozlacz);

  it('formularz otwarty przed odnowieniem: po przesunięciu okresu zmiana daty = 409, okres i portfel bez zmian (bez drugiego obciążenia)', async () => {
    const op = await operator('ADMIN');
    const k = await klient(100);
    const zgl = await prisma().ticket.create({ data: { userId: k.id, zrodlo: 'PANEL', subject: 'Awaria', message: 'x' } });
    const koniec = new Date(Date.now() + 12 * 3600000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    const przed = koniec;
    // Odnowienie w międzyczasie: portfel obciążony, okres przesunięty o miesiąc.
    await scheduler().handleHourlyTick();
    const poOdnowieniu = (await sub(u.id)).currentPeriodEnd!;
    expect(poOdnowieniu.getTime()).toBeGreaterThan(koniec.getTime() + 20 * 86400000);
    expect(await saldo(k.id)).toBe(55);
    // „Przedłużenie gratis” o 7 dni od starego końca — dziś byłoby skróceniem opłaconego okresu.
    const nowa = new Date(koniec.getTime() + 7 * 86400000);
    await expect(
      cykl().zmienDateOdnowienia({ subscriptionId: u.id, operator: op, powod: POWOD, nowaData: nowa, przed, zgloszenie: zgl.id }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await sub(u.id)).currentPeriodEnd?.toISOString()).toBe(poOdnowieniu.toISOString());
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'RENEWAL_DATE_CHANGED' } })).toBe(0);
  });
});

describe('audyt Fali 3 — wyścig anulacji na koniec okresu z przebiegiem odnowień (portfel)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zakonczone.length = 0;
    stripeWywolania.length = 0;
    stripePada = false;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(rozlacz);

  const nowySerwisSubskrypcji = async () => {
    const p = prisma() as never;
    const { SubscriptionsService } = await import('../../src/subscriptions/subscriptions.service.js');
    return new SubscriptionsService(
      p, new AuditService(p), new WalletLedgerService(p), null as never, null as never, null as never, null as never,
      { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never, null as never, null as never,
    );
  };

  it('anulacja zapisana po odczycie listy, przed obciążeniem: okres nie przesunięty, opłata zwrócona (idempotentnie), usługa kończy się w terminie', async () => {
    const op = await operator();
    const k = await klient(100);
    const koniec = new Date(Date.now() + 12 * 3600000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    const p = prisma() as never;
    const ledger = new WalletLedgerService(p);
    const debit = ledger.debit.bind(ledger);
    let raz = false;
    ledger.debit = async (a) => {
      if (!raz) {
        raz = true;
        await cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD });
      }
      return debit(a);
    };
    const audit = new AuditService(p);
    const promo = new PromoService(p, ledger, audit, { send: async () => ({}) } as never, { get: () => undefined } as never);
    const s = new RenewalScheduler(p, ledger, subs as never, audit, promo, eco as never);
    await s.handleHourlyTick();
    const po = await sub(u.id);
    expect(po.currentPeriodEnd?.toISOString()).toBe(koniec.toISOString());
    expect(po.cancelAt?.toISOString()).toBe(koniec.toISOString());
    expect(await saldo(k.id)).toBe(100);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.REFUND } })).toBe(1);
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'RENEWED' } })).toBe(0);
    // Kolejny przebieg: anulowanej nie odnawia i drugi raz nie zwraca.
    await s.handleHourlyTick();
    expect(await saldo(k.id)).toBe(100);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.REFUND } })).toBe(1);
  });

  it('przegląd poprawek: po zwrocie i cofnięciu anulacji obsługi następny przebieg obciąża od nowa (nie „opłacone” zwróconym obciążeniem)', async () => {
    const op = await operator();
    const k = await klient(100);
    const koniec = new Date(Date.now() + 12 * 3600000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    const p = prisma() as never;
    const ledger = new WalletLedgerService(p);
    const debit = ledger.debit.bind(ledger);
    let raz = false;
    ledger.debit = async (a) => {
      if (!raz) {
        raz = true;
        await cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD });
      }
      return debit(a);
    };
    const audit = new AuditService(p);
    const promo = new PromoService(p, ledger, audit, { send: async () => ({}) } as never, { get: () => undefined } as never);
    const s = new RenewalScheduler(p, ledger, subs as never, audit, promo, eco as never);
    await s.handleHourlyTick();
    expect(await saldo(k.id)).toBe(100);
    // Anulację zaplanowała obsługa — cofnięcie w ostatniej dobie jest dozwolone; usługa ma się odnowić za opłatą.
    await cykl().cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD });
    await s.handleHourlyTick();
    const po = await sub(u.id);
    expect(po.currentPeriodEnd!.getTime()).toBeGreaterThan(koniec.getTime());
    expect(await saldo(k.id)).toBe(55);
    // Kolejny przebieg nie obciąża drugi raz.
    await s.handleHourlyTick();
    expect(await saldo(k.id)).toBe(55);
  });

  it('odnowienie między odczytem a zapisem anulacji operatora: 409, cancelAt nie ustawione na stary koniec', async () => {
    const op = await operator();
    const k = await klient(100);
    const koniec = new Date(Date.now() + 12 * 3600000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    const pr = prisma();
    const oryginal = pr.subscription.findUnique.bind(pr.subscription);
    vi.spyOn(pr.subscription, 'findUnique').mockImplementationOnce(async (a: never) => {
      const stary = await oryginal(a);
      await pr.subscription.update({ where: { id: u.id }, data: { currentPeriodStart: koniec, currentPeriodEnd: new Date(koniec.getTime() + 30 * 86400000) } });
      return stary;
    });
    await expect(cykl().anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD })).rejects.toMatchObject({ status: 409 });
    expect((await sub(u.id)).cancelAt).toBeNull();
  });

  it('rezygnacja klienta (portfel) po odnowieniu w międzyczasie: 409 zamiast cancelAt na stary koniec', async () => {
    const k = await klient(100);
    const koniec = new Date(Date.now() + 12 * 3600000);
    const u = await usluga(k.id, { currentPeriodEnd: koniec });
    const pr = prisma();
    const oryginal = pr.subscription.findFirst.bind(pr.subscription);
    vi.spyOn(pr.subscription, 'findFirst').mockImplementationOnce(async (a: never) => {
      const stary = await oryginal(a);
      await pr.subscription.update({ where: { id: u.id }, data: { currentPeriodStart: koniec, currentPeriodEnd: new Date(koniec.getTime() + 30 * 86400000) } });
      return stary;
    });
    await expect((await nowySerwisSubskrypcji()).cancel(k.id, u.id, { atPeriodEnd: true })).rejects.toMatchObject({ status: 409 });
    expect((await sub(u.id)).cancelAt).toBeNull();
  });

  it('stan po wyścigu sprzed poprawki (cancelAt minęło, okres opłacony dalej): finalizacja nie kończy usługi, anulacja na koniec opłaconego okresu', async () => {
    const k = await klient(0);
    const minal = new Date(Date.now() - 3600000);
    const oplacony = new Date(Date.now() + 20 * 3600000);
    const u = await usluga(k.id, { currentPeriodEnd: oplacony, cancelAt: minal });
    await (await nowySerwisSubskrypcji()).finalizeScheduledCancellation(u.id);
    const po = await sub(u.id);
    expect(po.status).toBe('ACTIVE');
    expect(po.cancelAt?.toISOString()).toBe(oplacony.toISOString());
  });
});

describe('audyt Fali 3 — karta (Stripe): anulacja w obie strony z bieżącego stanu i zapis operatora, gdy webhook był pierwszy', () => {
  beforeEach(async () => {
    await wyczyscBaze();
  });
  afterAll(rozlacz);

  const stripeSub = (id: string, koniec: Date, anulowana: boolean) => ({
    id,
    status: 'active',
    customer: 'cus_x',
    cancel_at_period_end: anulowana,
    cancel_at: anulowana ? Math.floor(koniec.getTime() / 1000) : null,
    canceled_at: null,
    metadata: null,
    latest_invoice: null,
    items: { data: [{ id: 'si_x', price: { id: 'price_x' }, current_period_start: Math.floor((koniec.getTime() - 30 * 86400000) / 1000), current_period_end: Math.floor(koniec.getTime() / 1000) }] },
  });

  async function billing(stripeMock: Record<string, unknown>) {
    const p = prisma() as never;
    const ledger = new WalletLedgerService(p);
    const { SubscriptionsService } = await import('../../src/subscriptions/subscriptions.service.js');
    const { BillingService } = await import('../../src/billing/billing.service.js');
    const subsSvc = new SubscriptionsService(
      p, new AuditService(p), ledger, null as never, null as never, null as never, null as never,
      { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never, null as never, null as never,
    );
    const pusty = new Proxy({}, { get: () => async () => undefined }) as never;
    return new BillingService(p, ledger, stripeMock as never, new AuditService(p), { get: () => undefined } as never, pusty, subsSvc, pusty, pusty, pusty, pusty);
  }

  it('spóźnione „cancel_at_period_end=true” po cofnięciu: stan z bieżącej subskrypcji — cancelAt zostaje puste; „false” czyści cancelAt', async () => {
    const k = await klient(0);
    const koniec = new Date(Math.floor((Date.now() + 10 * 86400000) / 1000) * 1000);
    const sid = `sub_f3s_${Date.now()}`;
    const u = await usluga(k.id, { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: sid, currentPeriodEnd: koniec });
    let wStripe = false;
    const b = await billing({ retrieveSubscription: async (id: string) => stripeSub(id, koniec, wStripe) });
    const upsert = (obiekt: unknown) => (b as unknown as { handleSubscriptionUpsert(e: unknown): Promise<void> }).handleSubscriptionUpsert({ type: 'customer.subscription.updated', data: { object: obiekt } });

    await upsert(stripeSub(sid, koniec, true));
    expect((await sub(u.id)).cancelAt).toBeNull();

    wStripe = true;
    await upsert(stripeSub(sid, koniec, true));
    expect((await sub(u.id)).cancelAt?.toISOString()).toBe(koniec.toISOString());

    wStripe = false;
    await upsert(stripeSub(sid, koniec, false));
    expect((await sub(u.id)).cancelAt).toBeNull();

    // Błąd odczytu ze Stripe = błąd zdarzenia (ponowienie), bez zapisu.
    await prisma().subscription.update({ where: { id: u.id }, data: { cancelAt: koniec } });
    const pada = await billing({ retrieveSubscription: async () => { throw new Error('stripe 500'); } });
    await expect((pada as unknown as { handleSubscriptionUpsert(e: unknown): Promise<void> }).handleSubscriptionUpsert({ type: 'customer.subscription.updated', data: { object: stripeSub(sid, koniec, false) } })).rejects.toThrow();
    expect((await sub(u.id)).cancelAt?.toISOString()).toBe(koniec.toISOString());
  });

  it('webhook zapisał anulację przed operatorem: sukces z wpisem w dzienniku (kto i dlaczego), nie 409 bez śladu; to samo przy cofnięciu', async () => {
    const op = await operator();
    const k = await klient(0);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const sid = `sub_f3w_${Date.now()}`;
    const u = await usluga(k.id, { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: sid, currentPeriodEnd: koniec });
    const stripeMock = {
      cancelSubscription: async () => void (await prisma().subscription.update({ where: { id: u.id }, data: { cancelAt: koniec } })),
      cofnijAnulacjeSubskrypcji: async () => void (await prisma().subscription.update({ where: { id: u.id }, data: { cancelAt: null } })),
    };
    const svc = new CyklZyciaUslugiService(prisma() as never, new AuditService(prisma() as never), stripeMock as never);
    expect(await svc.anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: false });
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'CANCEL_SCHEDULED' } })).toBe(1);
    expect(await prisma().auditLog.findFirst({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.id, actorUserId: op.userId } })).toMatchObject({
      details: expect.objectContaining({ akcja: 'anulacja-na-koniec-okresu', powod: POWOD }),
    });
    expect(await svc.cofnijAnulacje({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: false });
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'CANCEL_REVOKED' } })).toBe(1);
    expect(await prisma().auditLog.count({ where: { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.id } })).toBe(2);
  });

  it('lokalnie „anulowana”, w Stripe nie (rozjazd): operator anuluje ponownie w systemie płatności zamiast „bez zmian”', async () => {
    const op = await operator();
    const k = await klient(0);
    const koniec = new Date(Date.now() + 10 * 86400000);
    const sid = `sub_f3r_${Date.now()}`;
    const u = await usluga(k.id, { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: sid, currentPeriodEnd: koniec, cancelAt: koniec });
    const wolania: string[] = [];
    const stripeMock = {
      retrieveSubscription: async (id: string) => stripeSub(id, koniec, false),
      cancelSubscription: async (id: string) => void wolania.push(`cancel:${id}`),
    };
    const svc = new CyklZyciaUslugiService(prisma() as never, new AuditService(prisma() as never), stripeMock as never);
    expect(await svc.anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: false });
    expect(wolania).toEqual([`cancel:${sid}`]);
    // W Stripe anulowana — „bez zmian”, bez drugiego wywołania.
    stripeMock.retrieveSubscription = async (id: string) => stripeSub(id, koniec, true);
    expect(await svc.anulujNaKoniecOkresu({ subscriptionId: u.id, operator: op, powod: POWOD })).toMatchObject({ bezZmian: true });
    expect(wolania).toHaveLength(1);
  });
});
