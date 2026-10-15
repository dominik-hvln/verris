import { Prisma } from '@verris/database';
import { WalletAutoTopupService } from './wallet-auto-topup.service.js';

// Przegląd karty 15.10: PI succeeded, webhook payment_intent.succeeded jeszcze niezaksięgowany (opóźnienie/awaria
// webhooka > 1 h) → saldo nadal poniżej progu → kolejny przebieg obciąża kartę drugi raz.
const D = (v: number) => new Prisma.Decimal(v);
describe('auto-doładowanie: obciążenie bez zaksięgowania poprzedniego', () => {
  afterEach(() => vi.useRealTimers());
  it('nie obciąża ponownie, gdy poprzedni PaymentIntent udany, a K nie dotarły do portfela', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-12T10:05:00Z'));
    const stan = { lastAttemptOk: null as boolean | null, cooldownUntil: null as Date | null };
    const regula = () => ({
      userId: 'u1', threshold: D(50), topupAmount: D(100), currency: 'PLN', paymentMethodId: null, enabled: true, ...stan,
      user: { id: 'u1', email: 'k@x.pl', firstName: null, walletBalance: D(10), walletCurrency: 'PLN', stripeCustomerId: 'cus_1', defaultPaymentMethodId: 'pm_1' },
    });
    let n = 0;
    const prisma = {
      walletAutoTopup: {
        findMany: vi.fn(async () => (stan.cooldownUntil && stan.cooldownUntil > new Date() ? [] : [regula()])),
        update: vi.fn(async (a: { data: typeof stan }) => { Object.assign(stan, a.data); return {}; }),
        updateMany: vi.fn(async (a: { data: typeof stan }) => { Object.assign(stan, a.data); return { count: 1 }; }),
      },
      paymentMethod: { findFirst: vi.fn(async () => null) },
      walletTransaction: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
    };
    const stripe = {
      isConfigured: () => true,
      createOffSessionPaymentIntent: vi.fn(async () => ({ id: `pi_${++n}`, status: 'succeeded' })),
    };
    const svc = new WalletAutoTopupService(prisma as never, stripe as never, { record: vi.fn() } as never, { send: vi.fn() } as never, { get: () => undefined } as never);
    await svc.runEligibleChecks();
    vi.setSystemTime(new Date('2027-01-12T11:06:00Z')); // webhook wciąż nie dotarł (Stripe ponawia do 3 dni)
    await svc.runEligibleChecks();
    vi.setSystemTime(new Date('2027-01-12T12:07:00Z'));
    await svc.runEligibleChecks();
    expect(stripe.createOffSessionPaymentIntent).toHaveBeenCalledTimes(1);
  });

  it('po zaksięgowaniu poprzedniej wpłaty (webhook) kolejne obciążenie przy saldzie poniżej progu jest dozwolone', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-01-12T10:05:00Z'));
    const stan = { lastAttemptOk: true as boolean | null, lastAttemptAt: new Date('2027-01-12T08:00:00Z') as Date | null, cooldownUntil: null as Date | null };
    const regula = () => ({
      userId: 'u1', threshold: D(50), topupAmount: D(100), currency: 'PLN', paymentMethodId: null, enabled: true, ...stan,
      user: { id: 'u1', email: 'k@x.pl', firstName: null, walletBalance: D(10), walletCurrency: 'PLN', stripeCustomerId: 'cus_1', defaultPaymentMethodId: 'pm_1' },
    });
    const findFirst = vi.fn(async () => ({ id: 'wpis-z-webhooka' }));
    const prisma = {
      walletAutoTopup: {
        findMany: vi.fn(async () => [regula()]),
        update: vi.fn(async (a: { data: typeof stan }) => { Object.assign(stan, a.data); return {}; }),
        updateMany: vi.fn(async (a: { data: typeof stan }) => { Object.assign(stan, a.data); return { count: 1 }; }),
      },
      paymentMethod: { findFirst: vi.fn(async () => null) },
      walletTransaction: { findFirst },
    };
    const stripe = { isConfigured: () => true, createOffSessionPaymentIntent: vi.fn(async () => ({ id: 'pi_9', status: 'succeeded' })) };
    const svc = new WalletAutoTopupService(prisma as never, stripe as never, { record: vi.fn() } as never, { send: vi.fn() } as never, { get: () => undefined } as never);
    await svc.runEligibleChecks();
    expect(stripe.createOffSessionPaymentIntent).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'u1', idempotencyKey: { startsWith: 'stripe:pi:' } }) }));
  });
});
