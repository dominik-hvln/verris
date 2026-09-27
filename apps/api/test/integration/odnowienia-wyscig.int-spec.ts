import { ConflictException } from '@nestjs/common';
import { SubscriptionStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { WalletLedgerService } from '../../src/billing/wallet-ledger.service.js';
import { PromoService } from '../../src/billing/promo.service.js';
import { RenewalScheduler } from '../../src/subscriptions/renewal.scheduler.js';
import { prisma, rozlacz, utworzPlan, wyczyscBaze } from './setup.js';

/**
 * X-04 — odnowienie z pustego portfela w tej samej chwili, w której klient sam opłaca usługę
 * („Opłać teraz” po doładowaniu). Opłacona usługa nie może wrócić do „zaległa” i wejść w karencję.
 */
describe('X-04 odnowienie vs ręczna opłata', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('harmonogram nie oznacza zaległości, gdy klient opłacił okres w międzyczasie', async () => {
    const plan = await utworzPlan();
    const k = await prisma().user.create({ data: { email: `odnw-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 10 } });
    const koniec = new Date(Date.now() + 12 * 3600_000);
    const u = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: SubscriptionStatus.ACTIVE, interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 29 * 86400_000), currentPeriodEnd: koniec } as never,
    });
    const p = prisma() as never;
    const ledger = new WalletLedgerService(p);
    // Obciążenie z harmonogramu odbija się od pustego portfela, a w tej chwili klient opłaca okres sam.
    (ledger as unknown as { debit: () => Promise<never> }).debit = async () => {
      await prisma().subscription.update({ where: { id: u.id }, data: { currentPeriodStart: koniec, currentPeriodEnd: new Date(koniec.getTime() + 30 * 86400_000) } });
      throw new ConflictException('Insufficient wallet balance');
    };
    const audit = new AuditService(p);
    const promo = new PromoService(p, ledger, audit, { send: async () => ({}) } as never, { get: () => undefined } as never);
    const s = new RenewalScheduler(p, ledger, { finalizeScheduledCancellation: async () => null, suspend: async () => undefined } as never, audit, promo, { safeAward: () => undefined } as never);
    await s.handleHourlyTick();
    const po = await prisma().subscription.findUniqueOrThrow({ where: { id: u.id } });
    expect(po.status).toBe('ACTIVE');
    expect(await prisma().subscriptionEvent.count({ where: { subscriptionId: u.id, type: 'PAYMENT_FAILED' } })).toBe(0);
  });
});

describe('X-04 koniec karencji vs opłata', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('klient opłacił zaległą usługę po wybraniu listy do zawieszenia: usługa zostaje aktywna', async () => {
    const plan = await utworzPlan();
    const k = await prisma().user.create({ data: { email: `kar-${Date.now()}@test.verris.pl`, passwordHash: 'x', walletBalance: 0 } });
    const u = await prisma().subscription.create({
      data: { userId: k.id, planId: plan.id, status: SubscriptionStatus.PAST_DUE, interval: 'MONTH', priceAmount: 45, currency: 'PLN', paymentSource: 'WALLET', currentPeriodEnd: new Date(Date.now() - 5 * 86400_000) } as never,
    });
    await prisma().subscriptionEvent.create({ data: { subscriptionId: u.id, type: 'PAYMENT_FAILED', createdAt: new Date(Date.now() - 4 * 86400_000) } as never });
    const p = prisma() as never;
    const ledger = new WalletLedgerService(p);
    const audit = new AuditService(p);
    const promo = new PromoService(p, ledger, audit, { send: async () => ({}) } as never, { get: () => undefined } as never);
    const { SubscriptionsService } = await import('../../src/subscriptions/subscriptions.service.js');
    const subs = new SubscriptionsService(
      p, audit, ledger, null as never, null as never, null as never, null as never,
      { send: async () => ({}) } as never, { get: () => undefined } as never, null as never, null as never, null as never, null as never,
    );
    const s = new RenewalScheduler(p, ledger, subs as never, audit, promo, { safeAward: () => undefined } as never);
    const pr = prisma();
    const oryginal = pr.subscription.findMany.bind(pr.subscription);
    const szpieg = vi.spyOn(pr.subscription, 'findMany').mockImplementation(async (a: never) => {
      const lista = await oryginal(a);
      if ((a as { where?: { status?: string } }).where?.status === 'PAST_DUE') {
        await pr.subscription.update({ where: { id: u.id }, data: { status: 'ACTIVE', currentPeriodEnd: new Date(Date.now() + 30 * 86400_000) } });
      }
      return lista;
    });
    await (s as unknown as { runGraceExpiry(): Promise<void> }).runGraceExpiry();
    szpieg.mockRestore();
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: u.id } })).status).toBe('ACTIVE');
  });
});
