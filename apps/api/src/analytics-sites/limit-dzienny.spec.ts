import { AnalyticsSitesService } from './analytics-sites.service.js';

/** Audyt 13.10 (zaległość): anonimowy collect bez dziennego limitu na stronę zapychał tabelę zdarzeń bez końca. */
describe('Analityka — dzienny limit zdarzeń na stronę', () => {
  function usluga(juzDzis: number) {
    const create = vi.fn(async () => ({}));
    const count = vi.fn(async () => juzDzis);
    const prisma = {
      analyticsSite: { findUnique: vi.fn(async () => ({ id: 'site1', enabled: true, domain: 'firma.pl' })) },
      analyticsEvent: { create, count },
    };
    const svc = new AnalyticsSitesService(prisma as never, { record: vi.fn() } as never, { get: () => 'sekret' } as never);
    return { svc, create, count };
  }
  const hit = { siteKey: 'k', path: '/', ip: '1.2.3.4', userAgent: 'Mozilla/5.0' };

  it('pod progiem zapisuje; po osiągnięciu progu kolejne zdarzenia z tej doby pomija (bez zapisu)', async () => {
    const t = usluga(AnalyticsSitesService.MAX_ZDARZEN_DZIENNIE - 2);
    for (let i = 0; i < 5; i++) await t.svc.collect(hit);
    expect(t.create).toHaveBeenCalledTimes(2);
    expect(t.count).toHaveBeenCalledTimes(1); // licznik z bazy raz na dobę, potem w pamięci
  });
});
