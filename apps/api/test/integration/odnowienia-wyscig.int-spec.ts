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
