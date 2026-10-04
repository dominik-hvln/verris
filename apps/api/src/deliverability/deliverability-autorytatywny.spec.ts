/**
 * t1 04.10: po usunięciu DMARC z panelu raport przez godzinę pokazywał „Poprawny” (cache resolvera, TTL 3600),
 * więc asystent nie proponował naprawy. Strefa na naszym węźle → pytamy węzeł wprost.
 */
const m = vi.hoisted(() => {
  const serwery: string[][] = [];
  const autorytatywne = vi.fn(async (_n: string): Promise<string[][]> => []);
  class Resolver {
    setServers(s: string[]) { serwery.push(s); }
    resolveTxt(n: string) { return autorytatywne(n); }
  }
  return { serwery, autorytatywne, rekurencyjne: vi.fn(async (_n: string): Promise<string[][]> => [['v=DMARC1; p=quarantine']]), Resolver };
});
vi.mock('dns', () => ({
  promises: { Resolver: m.Resolver, resolveTxt: m.rekurencyjne, resolve4: vi.fn(async () => { throw Object.assign(new Error(), { code: 'ENOTFOUND' }); }) },
}));

import { DeliverabilityService } from './deliverability.service.js';

const svc = () => new DeliverabilityService({} as never, {} as never, {} as never);
const dmarc = (r: Awaited<ReturnType<DeliverabilityService['check']>>) => r.checks.find((c) => c.key === 'dmarc')!;

beforeEach(() => { vi.clearAllMocks(); m.serwery.length = 0; });

it('strefa na węźle: TXT z węzła (brak DMARC widoczny od razu), nie z cache resolvera', async () => {
  m.autorytatywne.mockRejectedValue(Object.assign(new Error(), { code: 'ENODATA' }));
  const r = await svc().check('firma.pl', '203.0.113.7', [], true);
  expect(m.serwery).toContainEqual(['203.0.113.7']);
  expect(m.rekurencyjne).not.toHaveBeenCalledWith('_dmarc.firma.pl');
  expect(dmarc(r).status).not.toBe('ok');
});

it('węzeł nie odpowiada → zwykły resolver (nie fałszywy brak rekordu)', async () => {
  m.autorytatywne.mockRejectedValue(Object.assign(new Error(), { code: 'ETIMEOUT' }));
  const r = await svc().check('firma.pl', '203.0.113.7', [], true);
  expect(m.rekurencyjne).toHaveBeenCalledWith('_dmarc.firma.pl');
  expect(dmarc(r).status).toBe('ok');
});

it('DNS u obcego dostawcy → zwykły resolver', async () => {
  await svc().check('firma.pl', '203.0.113.7', [], false);
  expect(m.serwery).toEqual([]);
  expect(m.rekurencyjne).toHaveBeenCalledWith('_dmarc.firma.pl');
});
