import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { SubscriptionsService } from '../../src/subscriptions/subscriptions.service.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * Decyzja 6 (3.11.2026, P2-01 z bety): autoskalowanie włączone w zamówieniu domyślnie bez limitu kosztu, a klient
 * może od razu ustawić własny limit. Wcześniej zamówienie w ogóle nie przyjmowało limitu — usługa powstawała z 0
 * („bez limitu”), nawet gdy klient chciał go ustawić.
 */
function uslugi() {
  const p = prisma() as never;
  const ledger = new WalletLedgerService(p);
  const audit = new AuditService(p);
  const mailer = { send: async () => ({}) };
  const promo = new PromoService(p, ledger, audit, mailer as never, { get: () => undefined } as never);
  const queue = { isAsync: () => true, enqueueWalletProvision: async () => undefined };
  const provisioning = { sprawdzDomeneGlowna: async () => undefined, sprawdzMiejsce: async () => undefined };
  return new SubscriptionsService(
    p, audit, ledger, null as never, provisioning as never, queue as never, null as never,
    mailer as never, { get: () => undefined } as never, promo, { safeAward: () => undefined } as never,
    { getTrialOffer: async () => ({ cardEnabled: false, monthlyDiscountPct: 0, annualDiscountPct: 0 }) } as never, null as never,
  );
}

let n = 0;
const klient = () => {
  n += 1;
  return prisma().user.create({ data: { email: `limit-as-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 200 } });
};
const zamowienie = (planId: string, extra: Record<string, unknown>) =>
  ({ planId, interval: 'MONTH', paymentSource: 'WALLET', domain: `limit-${n}.pl`, immediatePerformanceConsent: true, ...extra }) as never;

describe('zamówienie z limitem autoskalowania', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('własny limit z zamówienia trafia na usługę', async () => {
    const k = await klient();
    const plan = await utworzPlan({ priceMonthly: 45 });
    const { subscription } = await uslugi().create(k.id, zamowienie(plan.id, { autoscalingEnabled: true, autoscalingMaxCost: 30.5 }));
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(s.autoscalingEnabled).toBe(true);
    expect(s.autoscalingMaxCost.toFixed(2)).toBe('30.50');
  });

  it('bez limitu (domyślnie): 0, czyli płatność za faktyczne użycie', async () => {
    const k = await klient();
    const plan = await utworzPlan({ priceMonthly: 45 });
    const { subscription } = await uslugi().create(k.id, zamowienie(plan.id, { autoscalingEnabled: true }));
    const s = await prisma().subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(s.autoscalingEnabled).toBe(true);
    expect(s.autoscalingMaxCost.toFixed(2)).toBe('0.00');
  });
});
