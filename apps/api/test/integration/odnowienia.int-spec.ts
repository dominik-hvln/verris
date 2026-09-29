import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * X-04 — odnowienia z portfela na prawdziwej bazie: obciążenie + przedłużenie okresu w jednym
 * przebiegu, brak podwójnego obciążenia, karencja przy braku środków, „Opłać teraz” po doładowaniu,
 * zawieszenie bez prolongaty, przywrócenie po zapłacie i rabat startowy. Pieniądze — więc atrapy tylko
 * dla DirectAdmina (suspend/unsuspend).
 */

const zawieszone: string[] = [];
const odwieszone: string[] = [];
let odwieszenieDziala = true;
const subs = {
  finalizeScheduledCancellation: async () => null,
  suspend: async (o: { subscriptionId: string; reason: string }) => {
    zawieszone.push(o.subscriptionId);
    await prisma().subscription.update({ where: { id: o.subscriptionId }, data: { status: SubscriptionStatus.SUSPENDED } });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: o.subscriptionId, type: 'SUSPENDED', details: { reason: o.reason } } });
  },
  unsuspend: async (o: { subscriptionId: string }) => {
    if (!odwieszenieDziala) throw new Error('DA niedostępny');
    odwieszone.push(o.subscriptionId);
    await prisma().subscription.update({ where: { id: o.subscriptionId }, data: { status: SubscriptionStatus.ACTIVE } });
  },
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
  return prisma().user.create({ data: { email: `x04-odn-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo } });
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

describe('X-04 — odnowienia z portfela (RenewalScheduler)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    zawieszone.length = 0;
    odwieszone.length = 0;
    odwieszenieDziala = true;
  });
  afterAll(rozlacz);

  it('obciąża raz i przedłuża okres o miesiąc; drugi przebieg nie obciąża ponownie', async () => {
    const k = await klient(100);
    const u = await usluga(k.id);
    const koniec = u.currentPeriodEnd!;
    await scheduler().handleHourlyTick();
    expect(await saldo(k.id)).toBe(55);
    const po = await sub(u.id);
    expect(po.status).toBe('ACTIVE');
    expect(po.currentPeriodStart?.toISOString()).toBe(koniec.toISOString());
    expect(po.currentPeriodEnd!.getTime()).toBeGreaterThan(koniec.getTime() + 27 * 86400000);
    await scheduler().handleHourlyTick();
    expect(await saldo(k.id)).toBe(55);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
  });

  it('brak środków → PAST_DUE z jednym zdarzeniem; doładowanie + „Opłać teraz” → ACTIVE', async () => {
    const k = await klient(10);
    const u = await usluga(k.id);
    await scheduler().handleHourlyTick();
    await scheduler().handleHourlyTick();
    expect((await sub(u.id)).status).toBe('PAST_DUE');
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'PAYMENT_FAILED' } })).toBe(1);
    expect(await saldo(k.id)).toBe(10);

    await expect(scheduler().retryPastDueNow(k.id, u.id)).rejects.toMatchObject({ status: 400 });
    await new WalletLedgerService(prisma() as never).credit({ userId: k.id, type: WalletTxType.TOPUP, amount: '50.00' });
    await expect(scheduler().retryPastDueNow(k.id, u.id)).resolves.toEqual({ status: 'ACTIVE' });
    expect(await saldo(k.id)).toBe(15);
    // Cudza usługa: jak nieistniejąca.
    const obcy = await klient(0);
    await expect(scheduler().retryPastDueNow(obcy.id, u.id)).rejects.toMatchObject({ status: 404 });
  });

  // Decyzja 29.09.2026 („od razu, 14 + 14 dni”): bez prolongaty, ale opłaconego okresu nie odbieramy.
  it('nieudane odnowienie: zawieszenie z końcem opłaconego okresu, nie wcześniej', async () => {
    const k = await klient(0);
    const trwa = await usluga(k.id);
    const minal = await usluga(k.id, { currentPeriodEnd: new Date(Date.now() - 60000) });
    await scheduler().handleHourlyTick();
    expect(zawieszone).toEqual([minal.id]);
    expect((await sub(trwa.id)).status).toBe('PAST_DUE');
    expect((await sub(minal.id)).status).toBe('SUSPENDED');
  });

  it('kartą (Stripe): zawieszenie w najbliższym przebiegu po nieudanej płatności, choć okres już przesunięty', async () => {
    const k = await klient(0);
    const u = await usluga(k.id, {
      status: SubscriptionStatus.PAST_DUE, paymentSource: 'STRIPE_CARD', stripeSubscriptionId: `sub_x04_${Date.now()}`,
      currentPeriodEnd: new Date(Date.now() + 29 * 86400000),
    });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: u.id, type: 'PAYMENT_FAILED', createdAt: new Date(Date.now() - 60000) } });
    await scheduler().handleHourlyTick();
    expect(zawieszone).toEqual([u.id]);
  });

  it('zawieszona za brak płatności: doładowanie → jedno obciążenie, nowy okres i odwieszenie', async () => {
    const k = await klient(0);
    const u = await usluga(k.id, { currentPeriodEnd: new Date(Date.now() - 60000) });
    const koniec = u.currentPeriodEnd!;
    await scheduler().handleHourlyTick();
    expect((await sub(u.id)).status).toBe('SUSPENDED');
    await scheduler().handleHourlyTick();
    expect(odwieszone).toEqual([]);

    await new WalletLedgerService(prisma() as never).credit({ userId: k.id, type: WalletTxType.TOPUP, amount: '50.00' });
    odwieszenieDziala = false;
    await scheduler().handleHourlyTick();
    // Obciążona, okres przesunięty, ale konto jeszcze zawieszone (serwer nie odpowiedział).
    expect(await saldo(k.id)).toBe(5);
    const posrednio = await sub(u.id);
    expect(posrednio.status).toBe('SUSPENDED');
    expect(posrednio.currentPeriodEnd!.getTime()).toBeGreaterThan(koniec.getTime() + 27 * 86400000);

    odwieszenieDziala = true;
    await scheduler().handleHourlyTick();
    expect(odwieszone).toEqual([u.id]);
    expect((await sub(u.id)).status).toBe('ACTIVE');
    expect(await saldo(k.id)).toBe(5);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
  });

  it('„Opłać z portfela” przy zawieszeniu: za brak płatności wraca od razu, ręczne zawieszenie — nie', async () => {
    const k = await klient(100);
    const u = await usluga(k.id, { status: SubscriptionStatus.SUSPENDED, currentPeriodEnd: new Date(Date.now() - 86400000) });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: u.id, type: 'SUSPENDED', details: { reason: 'GRACE_EXPIRED' } } });
    await expect(scheduler().retryPastDueNow(k.id, u.id)).resolves.toEqual({ status: 'ACTIVE' });
    expect(await saldo(k.id)).toBe(55);
    expect(odwieszone).toEqual([u.id]);

    const reczna = await usluga(k.id, { status: SubscriptionStatus.SUSPENDED, currentPeriodEnd: new Date(Date.now() - 86400000) });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: reczna.id, type: 'SUSPENDED', details: { reason: 'PAYMENT_FAILED' } } });
    await expect(scheduler().retryPastDueNow(k.id, reczna.id)).rejects.toThrow('zawiesiła obsługa');
    await scheduler().handleHourlyTick();
    expect((await sub(reczna.id)).status).toBe('SUSPENDED');
    expect(await saldo(k.id)).toBe(55);
  });

  it('rabat startowy: okres z rabatem liczony od ceny z cennika i zużywany po opłacie', async () => {
    const k = await klient(100);
    const u = await usluga(k.id, { listPriceAmount: 45, introDiscountPct: 50, introDiscountPeriodsLeft: 1 });
    await scheduler().handleHourlyTick();
    expect(await saldo(k.id)).toBe(77.5);
    expect((await sub(u.id)).introDiscountPeriodsLeft).toBe(0);
  });

  it('usługa z zaplanowaną rezygnacją nie jest obciążana', async () => {
    const k = await klient(100);
    await usluga(k.id, { cancelAt: new Date(Date.now() - 60000) });
    await scheduler().handleHourlyTick();
    expect(await saldo(k.id)).toBe(100);
  });
});
