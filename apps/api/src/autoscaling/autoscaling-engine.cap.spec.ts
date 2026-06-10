import { Prisma } from '@verris/database';
import { AutoscalingEngineService } from './autoscaling-engine.service';

/**
 * Audit F-01 regression: the 30-day autoscaling spend is stored as NEGATIVE
 * ledger debits. The cap guard must treat it as a positive total — otherwise
 * `autoscalingMaxCost` is never enforced.
 */
describe('AutoscalingEngineService — cap guard (F-01)', () => {
  function buildService(opts: { thirtyDaySumNegative: string }) {
    const prisma = {
      walletTransaction: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { amount: new Prisma.Decimal(opts.thirtyDaySumNegative) },
        }),
      },
    };
    // Only `prisma` and pricing rules are exercised by guardScaleUp.
    return new AutoscalingEngineService(
      prisma as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
  }

  const rules = [
    {
      id: 'cpu-0',
      resource: 'CPU',
      unit: 'CPU_PERCENT_HOUR',
      pricePerUnit: new Prisma.Decimal('0.01'),
      currency: 'PLN',
      thresholdAbove: 0,
      isActive: true,
      validFrom: new Date(),
      validUntil: null,
      notes: null,
      createdAt: new Date(),
    },
  ] as never[];

  it('blocks scale-up with reason=cap_reached when 30d spend (stored negative) + projected exceeds cap', async () => {
    const service = buildService({ thirtyDaySumNegative: '-9.99' });
    const sub = {
      id: 'sub-1',
      autoscalingMaxCost: new Prisma.Decimal('10.00'),
      user: { walletBalance: new Prisma.Decimal('50.00') },
    };

    const result = await (service as never as {
      guardScaleUp: (
        sub: unknown,
        rules: unknown,
        cpu: number,
        ram: number,
        disk: number,
      ) => Promise<{ allowed: boolean; reason?: string }>;
    }).guardScaleUp(sub, rules, 25, 0, 0); // 25% CPU → 0.25 PLN/h projected

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('cap_reached');
  });

  it('allows scale-up when spend + projected stays under the cap', async () => {
    const service = buildService({ thirtyDaySumNegative: '-1.00' });
    const sub = {
      id: 'sub-2',
      autoscalingMaxCost: new Prisma.Decimal('10.00'),
      user: { walletBalance: new Prisma.Decimal('50.00') },
    };

    const result = await (service as never as {
      guardScaleUp: (
        sub: unknown,
        rules: unknown,
        cpu: number,
        ram: number,
        disk: number,
      ) => Promise<{ allowed: boolean; reason?: string }>;
    }).guardScaleUp(sub, rules, 25, 0, 0);

    expect(result.allowed).toBe(true);
  });

  it('blocks scale-up with reason=wallet_empty below the minimum balance', async () => {
    const service = buildService({ thirtyDaySumNegative: '0' });
    const sub = {
      id: 'sub-3',
      autoscalingMaxCost: new Prisma.Decimal('0'),
      user: { walletBalance: new Prisma.Decimal('0.50') },
    };

    const result = await (service as never as {
      guardScaleUp: (
        sub: unknown,
        rules: unknown,
        cpu: number,
        ram: number,
        disk: number,
      ) => Promise<{ allowed: boolean; reason?: string }>;
    }).guardScaleUp(sub, rules, 25, 0, 0);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('wallet_empty');
  });
});
