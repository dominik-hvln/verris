import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * F3.5 — cykl życia usługi na prawdziwej bazie: anulowana na koniec okresu nie odnawia się (także w oknie
 * odnowienia przed końcem okresu) i kończy się z jego końcem. Atrapa tylko dla operacji na węźle.
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
