import { Prisma, Role, SubscriptionPaymentSource, SubscriptionStatus } from '@verris/database';
import { ForbiddenException } from '@nestjs/common';
import { PlanChangeService } from './plan-change.service';

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
    da?: { setAccountLimits: jest.Mock };
    wallet?: { debit: jest.Mock; credit: jest.Mock };
    stripe?: { updateSubscriptionPrice: jest.Mock; retrieveSubscription: jest.Mock };
    usageMetric?: { findMany: jest.Mock };
  } = {}) {
    const da = {
      getClientForServer: jest.fn().mockResolvedValue({
        setAccountLimits: overrides.da?.setAccountLimits ?? jest.fn().mockResolvedValue({}),
      }),
    };
    const walletLedger = {
      debit: overrides.wallet?.debit ?? jest.fn(),
      credit: overrides.wallet?.credit ?? jest.fn(),
    };
    const stripe = {
      updateSubscriptionPrice: overrides.stripe?.updateSubscriptionPrice ?? jest.fn(),
      retrieveSubscription: overrides.stripe?.retrieveSubscription ?? jest.fn(),
    };
    const prisma = {
      plan: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({
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
        findMany: overrides.usageMetric?.findMany ?? jest.fn().mockResolvedValue([]),
      },
      subscription: {
        findFirst: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(baseSub),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          account: { update: jest.fn().mockResolvedValue({}) },
          server: { update: jest.fn().mockResolvedValue({}) },
          subscription: {
            update: jest.fn().mockResolvedValue({ id: 'sub-1' }),
          },
          subscriptionEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        return fn(tx);
      }),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const mailer = { send: jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn().mockReturnValue('https://panel.test') };

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
    const debit = jest.fn().mockResolvedValue({ id: 'tx-1' });
    const { service, walletLedger } = createService({ wallet: { debit, credit: jest.fn() } });
    await service.changeForAdmin('admin-1', Role.ADMIN, 'sub-1', 'plan-b', 'Upgrade na prośbę', false);
    expect(walletLedger.debit).toHaveBeenCalled();
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
        findMany: jest.fn().mockResolvedValue([{ diskUsageMb: 2048 }]),
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
