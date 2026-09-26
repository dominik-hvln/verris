import type { Mock } from 'vitest';
import { Prisma, Role, SubscriptionPaymentSource, SubscriptionStatus } from '@verris/database';
import { ForbiddenException } from '@nestjs/common';
import { PlanChangeService } from './plan-change.service.js';

describe('PlanChangeService (admin)', () => {
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
      subscription: {
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(baseSub),
        update: vi.fn(),
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

  it('rejects skipBilling for STAFF', async () => {
    const { service } = createService();
    await expect(
      service.changeForAdmin('staff-1', Role.STAFF, 'sub-1', 'plan-b', 'Klient prosił', true),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('skips wallet debit when admin uses skipBilling', async () => {
    const { service, walletLedger } = createService();
    await service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', 'plan-b', 'Korekta support', true);
    expect(walletLedger.debit).not.toHaveBeenCalled();
    expect(walletLedger.credit).not.toHaveBeenCalled();
  });

  it('debits wallet on upgrade for admin with billing enabled', async () => {
    const debit = vi.fn().mockResolvedValue({ id: 'tx-1' });
    const { service, walletLedger } = createService({ wallet: { debit, credit: vi.fn() } });
    await service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', 'plan-b', 'Upgrade na prośbę', false);
    expect(walletLedger.debit).toHaveBeenCalled();
  });

  it('Z-11: klucz zawiera plan źródłowy i stan subskrypcji — ponowna zmiana po zmianie stanu to nowy wpis', async () => {
    const debit = vi.fn().mockResolvedValue({ id: 'tx-1' });
    const { service, prisma } = createService({ wallet: { debit, credit: vi.fn() } });
    await service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', 'plan-b', 'Upgrade', false);
    await service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', 'plan-b', 'Upgrade', false);
    prisma.subscription.findUnique.mockResolvedValue({ ...baseSub, updatedAt: new Date('2027-02-01T10:00:00Z') });
    await service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', 'plan-b', 'Upgrade', false);
    const klucze = debit.mock.calls.map((c) => (c[0] as { idempotencyKey: string }).idempotencyKey);
    expect(klucze[0]).toBe(klucze[1]);
    expect(klucze[2]).not.toBe(klucze[0]);
    expect(klucze[0]).toContain('plan-a>plan-b');
  });

  it('rejects downgrade when disk usage exceeds target limit', async () => {
    const targetPlan = {
      id: 'plan-b',
      slug: 'micro',
      name: 'Micro',
      isActive: true,
      isPublic: false,
      cpuLimit: 50,
      ramLimitMb: 512,
      diskLimitMb: 1024,
      priceMonthly: new Prisma.Decimal(50),
      priceYearly: new Prisma.Decimal(500),
      ioLimitKbps: 10240,
      iopsLimit: 1024,
      entryProcesses: 40,
      nprocLimit: 20,
      stripePriceMonthlyId: null,
      stripePriceYearlyId: null,
    };
    const { service, prisma } = createService({
      usageMetric: {
        findMany: vi.fn().mockResolvedValue([{ diskUsageMb: 2048 }]),
      },
    });
    prisma.plan.findUnique.mockResolvedValue(targetPlan);

    await expect(
      service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', 'plan-b', 'Downgrade', true),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: expect.stringContaining('zużycie dysku'),
      }),
    });
  });
});
