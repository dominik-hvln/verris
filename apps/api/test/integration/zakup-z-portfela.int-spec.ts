import { SubscriptionStatus, WalletTxType } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * X-04 — zakup nowej usługi z portfela na prawdziwej bazie. Sedno: obciążenie dokładnie raz,
 * przy braku środków nic nie zeszło z portfela, a gdy założenie usługi się nie uda — zwrot.
 */

const kolejka: string[] = [];
let kolejkaPada = false;
let oferta = { cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 };
function uslugi() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const queue = {
    isAsync: () => true,
    enqueueWalletProvision: async (o: { subscriptionId: string }) => {
      if (kolejkaPada) throw new Error('kolejka niedostępna');
      kolejka.push(o.subscriptionId);
    },
  };
  return new SubscriptionsService(
    p, audit, ledger, null as never, null as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, null as never,
    { getTrialOffer: async () => oferta } as never, null as never,
  );
}

let n = 0;
const klient = (saldo: number, extra: Record<string, unknown> = {}) => {
  n += 1;
  return prisma().user.create({ data: { email: `zakup-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: saldo, ...extra } });
};
const saldo = async (id: string) => Number((await prisma().user.findUniqueOrThrow({ where: { id } })).walletBalance);
const zamowienie = (planId: string) =>
  ({ planId, interval: 'MONTH', paymentSource: 'WALLET', domain: 'sklep-testowy.pl', immediatePerformanceConsent: true }) as never;

describe('X-04 zakup usługi z portfela', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    kolejka.length = 0;
    kolejkaPada = false;
    oferta = { cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 };
  });
  afterAll(rozlacz);

  it('środki są: jedno obciążenie za cenę z cennika, okres ustawiony, zakładanie w kolejce', async () => {
    const k = await klient(100);
    const plan = await utworzPlan({ priceMonthly: 45 });
    const { subscription } = await uslugi().create(k.id, zamowienie(plan.id));
    expect(await saldo(k.id)).toBe(55);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.CHARGE_SUBSCRIPTION } })).toBe(1);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(s.status).toBe(SubscriptionStatus.PROVISIONING);
    expect(s.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * 86400000);
    expect(kolejka).toEqual([subscription.id]);
  });

  it('rabat startowy obniża pierwsze obciążenie i zostaje zapisany na usłudze', async () => {
    oferta = { cardEnabled: true, monthlyDiscountPct: 20, annualDiscountPct: 0, introDiscountPeriods: 12 } as typeof oferta;
    const k = await klient(100);
    const plan = await utworzPlan({ priceMonthly: 45 });
    const { subscription } = await uslugi().create(k.id, zamowienie(plan.id));
    expect(await saldo(k.id)).toBe(64);
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(Number(s.listPriceAmount)).toBe(45);
    expect(s.introDiscountPct).toBe(20);
    expect(s.introDiscountPeriodsLeft).toBe(11);
  });

  it('brak środków: odmowa, portfel nietknięty, nic nie trafia do zakładania', async () => {
    const k = await klient(10);
    const plan = await utworzPlan({ priceMonthly: 45 });
    await expect(uslugi().create(k.id, zamowienie(plan.id))).rejects.toThrow();
    expect(await saldo(k.id)).toBe(10);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id } })).toBe(0);
    expect(kolejka).toHaveLength(0);
    // Zostaje wiersz „czeka na płatność” — sprząta go subscription-abandonment po 48 h.
    expect(await prisma().subscription.count({ where: { userId: k.id, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING] } } })).toBe(0);
  });

  it('zakładanie się nie uda: pełny zwrot na portfel, usługa wraca do „czeka na płatność”', async () => {
    const k = await klient(100);
    const plan = await utworzPlan({ priceMonthly: 45 });
    kolejkaPada = true;
    await expect(uslugi().create(k.id, zamowienie(plan.id))).rejects.toThrow('kolejka niedostępna');
    expect(await saldo(k.id)).toBe(100);
    expect(await prisma().walletTransaction.count({ where: { userId: k.id, type: WalletTxType.REFUND } })).toBe(1);
    const [s] = await prisma().subscription.findMany({ where: { userId: k.id } });
    expect(s.status).toBe(SubscriptionStatus.PENDING_PAYMENT);
  });

  it('klient rozliczany poza Verris nie zamówi sam nowej usługi', async () => {
    const k = await klient(100, { billingOutside: true });
    const plan = await utworzPlan({ priceMonthly: 45 });
    await expect(uslugi().create(k.id, zamowienie(plan.id))).rejects.toThrow('opiekunem');
    expect(await saldo(k.id)).toBe(100);
    expect(await prisma().subscription.count({ where: { userId: k.id } })).toBe(0);
  });
});
