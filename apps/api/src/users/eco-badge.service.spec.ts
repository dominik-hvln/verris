import { Prisma } from '@verris/database';
import { EcoBadgeService } from './eco-badge.service';

describe('EcoBadgeService', () => {
  const tx = {
    user: { update: jest.fn() },
    ecoPointsLedgerEntry: { create: jest.fn() },
  };
  const prisma = {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    ecoBadgeImpressionDedup: { create: jest.fn() },
    ecoPointsLedgerEntry: { create: jest.fn(), aggregate: jest.fn() },
    $transaction: jest.fn((fn: (inner: typeof tx) => Promise<void>) => fn(tx)),
  };
  const platformSettings = {
    getClientConfig: jest.fn().mockResolvedValue({ ecoBadgeImpressionsPerPoint: 100 }),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'clientPanelUrl') return 'https://panel.verris.pl';
      return null;
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.ecoPointsLedgerEntry.aggregate.mockResolvedValue({ _sum: { delta: 2 } });
  });

  function service() {
    return new EcoBadgeService(prisma as never, platformSettings as never, config as never);
  }

  async function flushImpression() {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  it('awards a point after enough unique impressions', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', ecoBadgeImpressions: 99 });
    prisma.ecoBadgeImpressionDedup.create.mockResolvedValue({});

    service().recordImpression('tok', { ipAddress: '1.2.3.4', userAgent: 'x' }, { source: 'pixel' });
    await flushImpression();

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('skips panel preview referrers', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', ecoBadgeImpressions: 0 });

    service().recordImpression(
      'tok',
      { ipAddress: '1.2.3.4', userAgent: 'x' },
      { referer: 'https://panel.verris.pl/dashboard/eco', source: 'svg' },
    );
    await flushImpression();

    expect(prisma.ecoBadgeImpressionDedup.create).not.toHaveBeenCalled();
  });

  it('ignores duplicate bucket keys', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', ecoBadgeImpressions: 10 });
    prisma.ecoBadgeImpressionDedup.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
    );

    service().recordImpression('tok', { ipAddress: '1.2.3.4', userAgent: 'x' }, { source: 'svg' });
    await flushImpression();

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns badge stats for dashboard', async () => {
    prisma.user.findUnique.mockResolvedValue({ ecoBadgeImpressions: 250 });

    const stats = await service().getStats('u1');

    expect(stats.impressions).toBe(250);
    expect(stats.impressionsPerPoint).toBe(100);
    expect(stats.impressionsUntilNextPoint).toBe(50);
    expect(stats.pointsEarnedFromBadge).toBe(2);
  });
});
