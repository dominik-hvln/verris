import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service';
import { PromoService } from '../../src/billing/promo.service';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service';
import { WarunkiIndywidualneService } from '../../src/subscriptions/warunki-indywidualne.service';
import { AutoscalingBillingService } from '../../src/autoscaling/autoscaling-billing.service';
import { prisma, rozlacz, utworzPlan, utworzWezel, wyczyscBaze } from './setup';

/**
 * PB-27 / PB-28 — indywidualne warunki i rozliczenie poza Verris na prawdziwej bazie.
 * Sedno: własna cena trzyma się usługi przy odnowieniu, rabat obniża autoskalowanie,
 * a konto „poza Verris” niczego nie płaci z portfela, a okresy i tak się przedłużają.
 */

const kolejka: string[] = [];
function uslugi() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const queue = {
    isAsync: () => true,
    enqueueManualProvision: async (o: { subscriptionId: string }) => {
      kolejka.push(o.subscriptionId);
    },
  };
  const subs = new SubscriptionsService(
    p, audit, ledger, null as never, null as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, null as never, null as never, null as never,
  );
  return { subs, warunki: new WarunkiIndywidualneService(p, audit, subs), ledger, audit, promo };
}
function scheduler() {
  const { ledger, audit, promo } = uslugi();
  const s = { finalizeScheduledCancellation: async () => null, suspend: async () => null };
  const eco = { safeAward: () => undefined, awardSubscriptionRenewal: async () => undefined };
  return new RenewalScheduler(prisma() as never, ledger, s as never, audit, promo, eco as never);
}

let n = 0;
async function klient(saldo: number, extra: Record<string, unknown> = {}) {
  n += 1;
  return prisma().user.create({
    data: { email: `pb27-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo, ...extra },
  });
}
async function operator() {
  n += 1;
  return prisma().user.create({ data: { email: `pb27-op-${n}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
}
async function usluga(userId: string, extra: Record<string, unknown> = {}) {
  const plan = await utworzPlan();
  return prisma().subscription.create({
    data: {
      userId, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN',
      paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 29 * 86400000),
      currentPeriodEnd: new Date(Date.now() + 12 * 3600000), ...extra,
    } as never,
  });
}
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const sub = (id: string) => prisma().subscription.findUniqueOrThrow({ where: { id } });

describe('PB-27 / PB-28 — indywidualne warunki i rozliczenie poza Verris', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    kolejka.length = 0;
  });
  afterAll(rozlacz);

  it('własna cena obowiązuje przy odnowieniu; zmiana trafia do audytu z powodem', async () => {
    const k = await klient(100);
    const op = await operator();
    const u = await usluga(k.id);
    await uslugi().warunki.ustawWarunki(op.id, u.id, { individualPrice: 30, autoscalingDiscountPct: 20, powod: 'stały klient' });
    await scheduler().handleHourlyTick();
    expect(await saldo(k.id)).toBe(70);
    const wpis = await prisma().auditLog.findFirstOrThrow({ where: { action: 'SUBSCRIPTION_CUSTOM_TERMS' } });
    expect(wpis.actorUserId).toBe(op.id);
    expect(wpis.details).toMatchObject({ powod: 'stały klient', po: { cena: '30.00', rabatAutoskalowaniaPct: 20 } });
  });

  it('operator zakłada usługę na planie ukrytym z własną ceną; klient sam nie może', async () => {
    const k = await klient(0, { billingOutside: true });
    const op = await operator();
    const plan = await utworzPlan();
    await prisma().plan.update({ where: { id: plan.id }, data: { isPublic: false } });
    const { subs, warunki } = uslugi();
    const wynik = await warunki.zalozUsluge(op.id, k.id, {
      planId: plan.id, interval: 'MONTH', domain: 'klient-pb27.pl', individualPrice: 19.99, powod: 'umowa ramowa',
    });
    const s = await sub(wynik.subscription.id);
    expect(s).toMatchObject({ paymentSource: 'MANUAL', status: 'PROVISIONING' });
    expect(s.individualPrice?.toFixed(2)).toBe('19.99');
    expect(kolejka).toEqual([s.id]);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(0);
    await expect(
      subs.create(k.id, { planId: plan.id, interval: 'MONTH', domain: 'x.pl', paymentSource: 'WALLET', immediatePerformanceConsent: true } as never),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rozliczenie poza Verris: usługi na MANUAL, zaległość znika, okres przedłuża się bez obciążenia', async () => {
    const k = await klient(5);
    const op = await operator();
    const u = await usluga(k.id, { status: 'PAST_DUE', currentPeriodEnd: new Date(Date.now() - 3600000) });
    await uslugi().warunki.rozliczeniePoza(op.id, k.id, { wlaczone: true, powod: 'faktury od właściciela' });
    expect(await sub(u.id)).toMatchObject({ paymentSource: 'MANUAL', status: 'ACTIVE' });
    await scheduler().handleHourlyTick();
    const po = await sub(u.id);
    expect(po.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * 86400000);
    expect(await saldo(k.id)).toBe(5);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(0);

    await uslugi().warunki.rozliczeniePoza(op.id, k.id, { wlaczone: false, powod: 'wraca do portfela' });
    expect((await sub(u.id)).paymentSource).toBe('WALLET');
    expect(await prisma().auditLog.count({ where: { action: { in: ['BILLING_OUTSIDE_ENABLED', 'BILLING_OUTSIDE_DISABLED'] } } })).toBe(2);
  });

  it('karta cykliczna blokuje przełączenie (inaczej Stripe dalej by obciążał)', async () => {
    const k = await klient(0);
    const op = await operator();
    await usluga(k.id, { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_test_pb28' });
    await expect(uslugi().warunki.rozliczeniePoza(op.id, k.id, { wlaczone: true, powod: 'test' })).rejects.toMatchObject({ status: 409 });
    expect((await prisma().user.findUniqueOrThrow({ where: { id: k.id } })).billingOutside).toBe(false);
  });

  it('autoskalowanie: rabat obniża blok, a poza Verris blok idzie do zestawienia zamiast do portfela', async () => {
    const reguly = [
      { resource: 'CPU', unit: 'cpu_pct', pricePerUnit: 0.04, thresholdAbove: 0, isActive: true },
    ] as never;
    const biller = new AutoscalingBillingService(prisma() as never, new WalletLedgerService(prisma() as never));
    const konto = (subscriptionId: string, userId: string, id: string) => ({
      id, subscriptionId, userId, domain: 'a.pl', scaledCpu: 100, scaledRamMb: 0, scaledDiskMb: 0,
      scaledSince: null, scaledBilledUntil: null,
    });
    const acc = async (subscriptionId: string, userId: string) => {
      const srv = await utworzWezel();
      return prisma().account.create({
        data: { daUsername: `pb27${n}`, domain: `pb27-${n++}.pl`, userId, subscriptionId, serverId: srv.id } as never,
      });
    };
    const k1 = await klient(100);
    const u1 = await usluga(k1.id, { autoscalingDiscountPct: 50 });
    const a1 = await acc(u1.id, k1.id);
    const r1 = await biller.billDueBlocks(konto(u1.id, k1.id, a1.id), reguly);
    const k2 = await klient(100);
    const u2 = await usluga(k2.id, { paymentSource: 'MANUAL' });
    const a2 = await acc(u2.id, k2.id);
    const r2 = await biller.billDueBlocks(konto(u2.id, k2.id, a2.id), reguly);

    expect(r1.amountChargedPln).toBeCloseTo(r2.amountChargedPln / 2, 2);
    expect(await saldo(k1.id)).toBeCloseTo(100 - r1.amountChargedPln, 2);
    expect(await saldo(k2.id)).toBe(100);
    const podglad = await uslugi().warunki.podglad(k2.id);
    expect(podglad.autoskalowaniePoza[0]).toMatchObject({ subscriptionId: u2.id, bloki: 1 });
  });
});
