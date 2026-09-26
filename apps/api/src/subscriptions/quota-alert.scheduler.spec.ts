import { QuotaAlertScheduler, udzialPrzyLimicie } from './quota-alert.scheduler.js';

/** K-08 — alerty o limitach: dysk/transfer z DA oraz CPU/RAM z próbek LVE. */
function zbuduj(opts: { subs: number; statsPct?: number; hot?: { all: number; cpu: number; ram: number } }) {
  const wszystkie = Array.from({ length: opts.subs }, (_, i) => ({
    id: `s${String(i).padStart(4, '0')}`,
    userId: `u${i}`,
    account: { domain: `d${i}.pl`, scaledCpu: 0, scaledRamMb: 0 },
    plan: { cpuLimit: 100, ramLimitMb: 1024 },
    user: { email: `u${i}@x.pl`, firstName: null },
  }));
  const hot = opts.hot ?? { all: 1440, cpu: 0, ram: 0 };
  const prisma = {
    subscription: {
      findMany: vi.fn(async (a: { take: number; cursor?: { id: string } }) => {
        const od = a.cursor ? wszystkie.findIndex((s) => s.id === a.cursor!.id) + 1 : 0;
        return wszystkie.slice(od, od + a.take);
      }),
    },
    auditLog: { findMany: vi.fn(async () => []) },
    usageMetric: {
      count: vi.fn(async (a: { where: Record<string, unknown> }) =>
        'cpuUsageAvg' in a.where ? hot.cpu : 'memUsageAvgMb' in a.where ? hot.ram : hot.all,
      ),
    },
  };
  const pct = opts.statsPct ?? 10;
  const da = {
    getHostingAccountStats: vi.fn(async () => ({
      fetchError: null,
      disk: { usedMb: pct, limitMb: 100 },
      bandwidth: { usedMb: 0, limitMb: 100 },
    })),
  };
  const mailer = { send: vi.fn(async () => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const config = { get: () => 'https://panel.test' };
  const s = new QuotaAlertScheduler(prisma as never, da as never, mailer as never, audit as never, config as never);
  return { s, prisma, da, mailer, audit };
}

describe('udzialPrzyLimicie', () => {
  it('null przy małej liczbie próbek i poniżej progu 10%', () => {
    expect(udzialPrzyLimicie(59, 59)).toBeNull();
    expect(udzialPrzyLimicie(1000, 99)).toBeNull();
    expect(udzialPrzyLimicie(1000, 100)).toBe(10);
  });
});

describe('QuotaAlertScheduler', () => {
  it('sprawdza wszystkie konta, nie tylko pierwsze 500', async () => {
    const { s, da } = zbuduj({ subs: 450 * 2 });
    await s.run();
    expect(da.getHostingAccountStats).toHaveBeenCalledTimes(900);
  });

  it('CPU przy limicie przez część doby → mail z CPU i linkiem do zakładki zużycia', async () => {
    const { s, mailer, audit } = zbuduj({ subs: 1, hot: { all: 1440, cpu: 300, ram: 0 } });
    await s.run();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ details: expect.objectContaining({ cpuHotPct: 21, ramHotPct: null }) }),
    );
    const msg = (mailer.send.mock.calls[0] as unknown as [{ text: string; html: string }])[0];
    expect(msg.text).toContain('Procesor');
    expect(msg.text).not.toContain('Dysk');
    expect(msg.html).toContain('https://panel.test/dashboard/services/s0000?tab=usage');
  });

  it('nic przy limicie → bez maila', async () => {
    const { s, mailer } = zbuduj({ subs: 3 });
    await s.run();
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('dysk ponad 85% → mail jak dotąd', async () => {
    const { s, mailer } = zbuduj({ subs: 1, statsPct: 90 });
    await s.run();
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});
