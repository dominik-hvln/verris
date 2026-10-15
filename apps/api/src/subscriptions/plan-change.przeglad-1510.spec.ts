import type { Mock } from 'vitest';
import { Prisma, Role, SubscriptionPaymentSource, SubscriptionStatus } from '@verris/database';
import { PlanChangeService } from './plan-change.service.js';

/**
 * Przegląd 15.10 — pieniądze przy zmianie planu: upgrade gratis od admina zamieniany na kredyt, zmiana planu na triale.
 */
describe('PlanChangeService — przegląd 15.10', () => {
  const baseSub = {
    id: 'sub-1',
    userId: 'user-1',
    planId: 'plan-a',
    status: SubscriptionStatus.ACTIVE,
    interval: 'MONTH' as const,
    priceAmount: new Prisma.Decimal(100),
    currency: 'PLN',
    paymentSource: SubscriptionPaymentSource.WALLET,
    currentPeriodStart: new Date('2027-01-01'),
    currentPeriodEnd: new Date('2027-12-31'),
    updatedAt: new Date('2027-01-05T10:00:00Z'),
    stripeSubscriptionId: null,
    autoscalingEnabled: false,
    plan: {
      id: 'plan-a',
      slug: 'starter',
      name: 'Starter',
      cpuLimit: 100,
      ramLimitMb: 1024,
      diskLimitMb: 5120,
      priceMonthly: new Prisma.Decimal(100),
      priceYearly: new Prisma.Decimal(1000),
      ioLimitKbps: 10240,
      iopsLimit: 1024,
      entryProcesses: 40,
      nprocLimit: 20,
    },
    account: {
      id: 'acc-1',
      domain: 'example.pl',
      serverId: 'srv-1',
      daUsername: 'user1',
      scaledCpu: 0,
      scaledRamMb: 0,
      scaledDiskMb: 0,
    },
    user: {
      id: 'user-1',
      email: 'u@example.pl',
      firstName: 'Jan',
      walletBalance: new Prisma.Decimal(500),
    },
  };

  function createService(overrides: {
    da?: { setAccountLimits: Mock };
    wallet?: { debit: Mock; credit: Mock };
    stripe?: { updateSubscriptionPrice: Mock; retrieveSubscription: Mock };
    usageMetric?: { findMany: Mock };
  } = {}) {
    const da = {
      getClientForServer: vi.fn().mockResolvedValue({
        setAccountLimits: overrides.da?.setAccountLimits ?? vi.fn().mockResolvedValue({}),
      }),
    };
    const walletLedger = {
      debit: overrides.wallet?.debit ?? vi.fn(),
      credit: overrides.wallet?.credit ?? vi.fn(),
    };
    const stripe = {
      updateSubscriptionPrice: overrides.stripe?.updateSubscriptionPrice ?? vi.fn(),
      retrieveSubscription: overrides.stripe?.retrieveSubscription ?? vi.fn(),
    };
    const prisma = {
      plan: {
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({
          id: 'plan-b',
          slug: 'pro',
          name: 'Pro',
          isActive: true,
          isPublic: false,
          cpuLimit: 200,
          ramLimitMb: 2048,
          diskLimitMb: 10240,
          priceMonthly: new Prisma.Decimal(200),
          priceYearly: new Prisma.Decimal(2000),
          ioLimitKbps: 10240,
          iopsLimit: 1024,
          entryProcesses: 40,
          nprocLimit: 20,
          stripePriceMonthlyId: null,
          stripePriceYearlyId: null,
        }),
      },
      usageMetric: {
        findMany: overrides.usageMetric?.findMany ?? vi.fn().mockResolvedValue([]),
      },
      // Audyt Fali 3 — brak zmian daty odnowienia w okresie: cały okres opłacony.
      subscriptionEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      subscription: {
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(baseSub),
        update: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          account: { update: vi.fn().mockResolvedValue({}) },
          server: { update: vi.fn().mockResolvedValue({}) },
          subscription: {
            update: vi.fn().mockResolvedValue({ id: 'sub-1' }),
          },
          subscriptionEvent: { create: vi.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      }),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const mailer = { send: vi.fn().mockResolvedValue(undefined) };
    const config = { get: vi.fn().mockReturnValue('https://panel.test') };

    const service = new PlanChangeService(
      prisma as never,
      audit as never,
      walletLedger as never,
      stripe as never,
      da as never,
      mailer as never,
      config as never,
    );
    return { service, walletLedger, da, prisma };
  }

  const planB = {
    id: 'plan-b', slug: 'pro', name: 'Pro', isActive: true, isPublic: true,
    cpuLimit: 200, ramLimitMb: 2048, diskLimitMb: 10240,
    priceMonthly: new Prisma.Decimal(200), priceYearly: new Prisma.Decimal(2000),
    ioLimitKbps: 10240, iopsLimit: 1024, entryProcesses: 40, nprocLimit: 20,
    stripePriceMonthlyId: null, stripePriceYearlyId: null,
  };
  const planA = { ...baseSub.plan, isActive: true, isPublic: true, stripePriceMonthlyId: null, stripePriceYearlyId: null };

  /** Uruchamia zmianę i zwraca: dane zapisane w subskrypcji + obciążenie/kredyt portfela. */
  async function zmien(sub: Record<string, unknown>, target: Record<string, unknown> & { id: string }, kto: 'client' | 'admin-skip') {
    const debit = vi.fn().mockResolvedValue({ id: 'tx-d' });
    const credit = vi.fn().mockResolvedValue({ id: 'tx-c' });
    const { service, prisma } = createService({ wallet: { debit, credit } });
    prisma.plan.findUnique.mockResolvedValue(target);
    prisma.subscription.findFirst.mockResolvedValue(sub);
    prisma.subscription.findUnique.mockResolvedValue(sub);
    let zapis: Record<string, unknown> = {};
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        account: { update: vi.fn() },
        server: { update: vi.fn() },
        subscription: { update: vi.fn(async (a: { data: Record<string, unknown> }) => { zapis = a.data; return { id: 'sub-1' }; }) },
        subscriptionEvent: { create: vi.fn() },
      }),
    );
    if (kto === 'client') await service.changeForUser('user-1', 'sub-1', target.id);
    else await service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', target.id, 'gest', true);
    const pobrano = debit.mock.calls.reduce((s, c) => s + Number((c[0] as { amount: Prisma.Decimal }).amount), 0);
    const oddano = credit.mock.calls.reduce((s, c) => s + Number((c[0] as { amount: Prisma.Decimal }).amount), 0);
    return { zapis, pobrano, oddano };
  }

  const startSub = {
    ...baseSub,
    plan: planA,
    individualPrice: null,
    limitOverrides: null,
    isTrial: false,
    // Rabat na start −20% na 3 okresy: zapłacono 80 zł za plan A (cennik 100 zł).
    priceAmount: new Prisma.Decimal(80),
    listPriceAmount: new Prisma.Decimal(100),
    introDiscountPct: 20,
    introDiscountPeriodsLeft: 2,
    appliedPromoCodeId: null,
  };

  it('upgrade gratis przez admina (skipBilling): priceAmount zostaje zapłacone — downgrade nie daje kredytu za niezapłaconą różnicę', async () => {
    const zwykla = { ...startSub, priceAmount: new Prisma.Decimal(100), introDiscountPct: 0, introDiscountPeriodsLeft: 0 };
    const gratis = await zmien(zwykla, planB, 'admin-skip');
    expect(gratis.pobrano).toBe(0);
    const poGratis = {
      ...zwykla, planId: 'plan-b', plan: planB,
      priceAmount: gratis.zapis.priceAmount, listPriceAmount: gratis.zapis.listPriceAmount,
      updatedAt: new Date('2027-01-06T00:00:00Z'),
    };
    const down = await zmien(poGratis, planA, 'client');
    // Klient zapłacił za okres 100 zł i wraca na plan za 100 zł — nic mu się nie należy.
    expect(down.oddano).toBe(0);
  });

  it('okres próbny: zmiana planu odrzucona (dopłata liczona od triala, a trial wygasa bez zwrotu)', async () => {
    const debit = vi.fn();
    const { service, prisma } = createService({ wallet: { debit, credit: vi.fn() } });
    const trial = { ...startSub, isTrial: true, trialConvertedAt: null, priceAmount: new Prisma.Decimal(0), introDiscountPct: 0, introDiscountPeriodsLeft: 0 };
    prisma.plan.findUnique.mockResolvedValue(planB);
    prisma.subscription.findFirst.mockResolvedValue(trial);
    prisma.subscription.findUnique.mockResolvedValue(trial);
    await expect(service.changeForUser('user-1', 'sub-1', 'plan-b')).rejects.toThrow('W okresie próbnym nie zmienisz planu');
    expect(debit).not.toHaveBeenCalled();
  });
});
