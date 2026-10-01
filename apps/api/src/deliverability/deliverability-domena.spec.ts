import { DeliverabilityService } from './deliverability.service.js';

/**
 * E-16 — raport dostarczalności (SPF/DKIM/DMARC + „Włącz DKIM”) dla domeny dodatkowej usługi, nie tylko
 * głównej (test D3 30.09: nowa domena bez klucza była nieosiągalna z panelu). Cudza domena — odmowa.
 */
describe('DeliverabilityService.forSubscription — wybrana domena', () => {
  const prisma = {
    subscription: {
      findFirst: vi.fn(async () => ({ account: { domain: 'firma.pl', server: { ipAddress: '1.2.3.4', ns1: null, ns2: null, ns3: null } } })),
    },
  };
  const da = {
    listHostingDomainsForSubscription: vi.fn(async () => ({ domains: [{ name: 'firma.pl' }, { name: 'sklep.firma.pl' }] })),
    listHostingDnsRecords: vi.fn(async () => ({ records: [], fetchError: null })),
  };
  const ns = { getHostingNameservers: vi.fn(async () => ({ ns1: '', ns2: '', ns3: '' })) };

  it('domena dodatkowa usługi → raport dla niej; cudza → BadRequest', async () => {
    const svc = new DeliverabilityService(prisma as never, da as never, ns as never);
    const check = vi.spyOn(svc, 'check').mockResolvedValue({ domain: 'x' } as never);
    await svc.forSubscription('s1', 'u1', 'Sklep.Firma.pl');
    expect(check.mock.calls[0][0]).toBe('sklep.firma.pl');
    expect(da.listHostingDnsRecords).toHaveBeenCalledWith('s1', 'u1', 'sklep.firma.pl');
    await expect(svc.forSubscription('s1', 'u1', 'obca.pl')).rejects.toThrow('nie należy');
    await svc.forSubscription('s1', 'u1');
    expect(check.mock.calls.at(-1)![0]).toBe('firma.pl');
  });
});
