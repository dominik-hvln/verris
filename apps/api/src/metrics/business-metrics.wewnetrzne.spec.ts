import { BusinessMetricsService } from './business-metrics.service';

/** PROD-03 — konta wewnętrzne (testowe) nie wchodzą do MRR, churnu, nowych usług ani salda portfeli. */
describe('metryki biznesowe bez kont wewnętrznych', () => {
  it('każde zapytanie o subskrypcje i salda filtruje isInternal=false', async () => {
    const findMany = jest.fn(async () => []);
    const count = jest.fn(async () => 0);
    const users = jest.fn(async () => []);
    const prisma = { subscription: { findMany, count }, user: { findMany: users }, server: { findMany: jest.fn(async () => []) } };
    await new BusinessMetricsService(prisma as never).business();
    for (const [a] of findMany.mock.calls as unknown as [{ where: { user?: unknown } }][]) expect(a.where.user).toEqual({ isInternal: false });
    for (const [a] of count.mock.calls as unknown as [{ where: { user?: unknown } }][]) expect(a.where.user).toEqual({ isInternal: false });
    expect(count).toHaveBeenCalledTimes(3);
    expect(users).toHaveBeenCalledWith(expect.objectContaining({ where: { isInternal: false } }));
  });
});
