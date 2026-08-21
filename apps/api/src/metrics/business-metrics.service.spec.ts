import { Prisma, SubscriptionStatus } from '@verris/database';
import { BusinessMetricsService } from './business-metrics.service';

/**
 * REL-1 — testy ścieżki finansowej (BIZ-1). Pilnujemy deterministycznego
 * liczenia MRR (rok → /12), ARPU, churn i zobowiązań portfeli — bo te liczby
 * trafiają na dashboard zarządczy i nie mogą „pływać".
 */
describe('BusinessMetricsService.business', () => {
  function makeService() {
    const prisma = {
      subscription: {
        findMany: jest.fn().mockResolvedValue([
          { priceAmount: new Prisma.Decimal(100), interval: 'MONTH', plan: { productKind: 'HOSTING' } },
          { priceAmount: new Prisma.Decimal(1200), interval: 'YEAR', plan: { productKind: 'VPS' } },
        ]),
        count: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
          if (where.isTrial === true) return Promise.resolve(4); // trials
          if (where.createdAt) return Promise.resolve(5); // newThisMonth
          if (where.canceledAt) return Promise.resolve(1); // canceledThisMonth
          return Promise.resolve(0);
        }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { walletBalance: new Prisma.Decimal(50) },
          { walletBalance: new Prisma.Decimal('25.50') },
          { walletBalance: null },
        ]),
      },
      server: {
        findMany: jest.fn().mockResolvedValue([
          {
            totalCpuCores: 10,
            totalMemoryMb: 1000,
            totalDiskMb: 1000,
            // JEDNOSTKA: allocatedCpu jest w „% rdzenia" (LVE SPEED, 100 = 1 rdzeń),
            // tak samo liczy node-selector.service.ts:109. 10 rdzeni = 1000,
            // więc 50% floty to 500, nie 5. Poprzednia wartość zakładała rdzenie
            // i test wychodził 0,5% — wyglądało to na błąd metryki, a było błędem
            // w danych testowych.
            allocatedCpu: 500,
            allocatedMemory: 250,
            allocatedDisk: 100,
            _count: { accounts: 3 },
          },
        ]),
      },
    };
    return { service: new BusinessMetricsService(prisma as never), prisma };
  }

  it('normalizes yearly subscriptions to monthly in MRR (1200/yr → 100/mo)', async () => {
    const { service } = makeService();
    const m = await service.business();
    // 100 (MONTH) + 1200/12 (YEAR=100) = 200.00
    expect(m.mrr).toBe('200.00');
  });

  it('computes ARPU as MRR / active services', async () => {
    const { service } = makeService();
    const m = await service.business();
    expect(m.activeServices).toBe(2);
    expect(m.arpu).toBe('100.00');
  });

  it('counts active services per product kind', async () => {
    const { service } = makeService();
    const m = await service.business();
    expect(m.byProduct).toEqual(
      expect.arrayContaining([
        { productKind: 'HOSTING', count: 1 },
        { productKind: 'VPS', count: 1 },
      ]),
    );
  });

  it('sums wallet liability across users, treating null as 0', async () => {
    const { service } = makeService();
    const m = await service.business();
    expect(m.walletLiability).toBe('75.50');
  });

  it('computes churn % = canceled / (active + canceled), rounded to 0.1', async () => {
    const { service } = makeService();
    const m = await service.business();
    // 1 / (2 + 1) = 33.33% → 33.3
    expect(m.canceledThisMonth).toBe(1);
    expect(m.churnPct).toBe(33.3);
  });

  it('reports fleet utilization as alloc/total percentages', async () => {
    const { service } = makeService();
    const m = await service.business();
    expect(m.fleet).toEqual(
      expect.objectContaining({
        nodes: 1,
        accounts: 3,
        cpuUtilPct: 50,
        ramUtilPct: 25,
        diskUtilPct: 10,
      }),
    );
  });

  it('passes the correct status filter for active (non-trial) subscriptions', async () => {
    const { service, prisma } = makeService();
    await service.business();
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: SubscriptionStatus.ACTIVE, isTrial: false }),
      }),
    );
  });
});
