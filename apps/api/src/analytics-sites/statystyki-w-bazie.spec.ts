import { AnalyticsSitesService } from './analytics-sites.service.js';

/**
 * Audyt 13.10 (analytics-sites.service.ts:stats-materializes-attacker-fed-events) — statystyki ładowały do 500 tys.
 * surowych zdarzeń (zasilanych anonimowym collect) do pamięci API i liczyły je pętlą, blokując wspólną pętlę zdarzeń.
 * Agregację robi baza; w procesie API zostają wyniki o stałym rozmiarze. SQL i groupBy sprawdzone na PostgreSQL 16.
 */
function usluga() {
  const findMany = vi.fn(async () => {
    throw new Error('surowe zdarzenia nie mogą trafiać do pamięci API');
  });
  const groupBy = vi.fn(async ({ by }: { by: string[] }) => {
    const pole = by[0];
    const dane: Record<string, Array<[string, number]>> = {
      path: [['/a', 7], ['/b', 3]],
      refHost: [['google.com', 4]],
      country: [['PL', 10]],
      deviceType: [['mobile', 6], ['desktop', 4]],
    };
    return (dane[pole] ?? []).map(([v, n]) => ({ [pole]: v, _count: { _all: n } }));
  });
  const dzis = new Date().toISOString().slice(0, 10);
  const $queryRaw = vi
    .fn()
    .mockResolvedValueOnce([{ pv: 10, visitors: 4 }])
    .mockResolvedValueOnce([{ day: dzis, pv: 10, visitors: 4 }]);
  const prisma = {
    subscription: { findUnique: vi.fn(async () => ({ id: 'sub1', userId: 'u1' })) },
    analyticsSite: { findFirst: vi.fn(async () => ({ id: 'site1', subscriptionId: 'sub1' })), findUnique: vi.fn(async () => ({ id: 'site1', subscriptionId: 'sub1', userId: 'u1' })) },
    analyticsEvent: { findMany, groupBy },
    $queryRaw,
  };
  const svc = new AnalyticsSitesService(prisma as never, { record: vi.fn() } as never, { get: () => undefined } as never);
  return { svc, findMany, groupBy, $queryRaw, dzis };
}

describe('Statystyki analityki liczone w bazie', () => {
  it('bez ładowania surowych zdarzeń; sumy, seria dzienna i „top” z agregacji', async () => {
    const t = usluga();
    const s = await t.svc.stats('u1', 'sub1', 'site1', 7);
    expect(t.findMany).not.toHaveBeenCalled();
    expect(t.$queryRaw).toHaveBeenCalledTimes(2);
    expect(t.groupBy).toHaveBeenCalledTimes(4);
    expect(s.totals).toEqual({ pageviews: 10, visitors: 4 });
    expect(s.timeseries).toHaveLength(7);
    expect(s.timeseries.find((d) => d.date === t.dzis)).toEqual({ date: t.dzis, pageviews: 10, visitors: 4 });
    expect(s.timeseries.filter((d) => d.pageviews === 0)).toHaveLength(6);
    expect(s.topPages).toEqual([{ path: '/a', count: 7 }, { path: '/b', count: 3 }]);
    expect(s.topReferrers).toEqual([{ refHost: 'google.com', count: 4 }]);
    expect(s.devices[0]).toEqual({ deviceType: 'mobile', count: 6 });
  });

  it('„top” ograniczone do 10 i bez pustych wartości (refHost/country/deviceType)', async () => {
    const t = usluga();
    await t.svc.stats('u1', 'sub1', 'site1', 30);
    for (const call of t.groupBy.mock.calls) {
      const a = call[0] as { by: string[]; take: number; where: Record<string, unknown> };
      expect(a.take).toBe(10);
      if (a.by[0] !== 'path') expect(a.where[a.by[0]]).toEqual({ not: null });
    }
  });
});
