import { BusinessMetricsService } from './business-metrics.service.js';

/** PROD-03 — konta wewnętrzne (testowe) nie wchodzą do MRR, churnu, nowych usług ani salda portfeli. */
describe('metryki biznesowe bez kont wewnętrznych', () => {
  it('każde zapytanie o subskrypcje i salda filtruje isInternal=false', async () => {
    const findMany = vi.fn(async () => []);
    const count = vi.fn(async () => 0);
    const users = vi.fn(async () => []);
    const prisma = { subscription: { findMany, count }, user: { findMany: users }, server: { findMany: vi.fn(async () => []) } };
    await new BusinessMetricsService(prisma as never).business();
    for (const [a] of findMany.mock.calls as unknown as [{ where: { user?: unknown } }][]) expect(a.where.user).toEqual({ isInternal: false });
    for (const [a] of count.mock.calls as unknown as [{ where: { user?: unknown } }][]) expect(a.where.user).toEqual({ isInternal: false });
    expect(count).toHaveBeenCalledTimes(3);
    expect(users).toHaveBeenCalledWith(expect.objectContaining({ where: { isInternal: false } }));
  });
});
