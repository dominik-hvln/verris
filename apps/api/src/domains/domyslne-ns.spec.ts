import { DomainsController } from './domains.controller.js';

/** t1 04.10 — kreator domeny podpowiadał ns1/ns2.verris.pl, których nie ma w DNS; węzeł t1 to ns3/ns4. */
describe('domyślne NS nowej domeny (registrar/status)', () => {
  const ctl = (sub: unknown, platform = { ns1: '', ns2: '', ns3: '' }) =>
    new DomainsController(
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      { getRates: async () => ({}) } as never,
      { subscription: { findFirst: vi.fn(async () => sub) } } as never,
      { getHostingNameservers: vi.fn(async () => platform) } as never,
    );
  const u = { userId: 'u1' };

  it('NS węzła aktywnego hostingu klienta', async () => {
    const r = await ctl({ account: { server: { ns1: 'ns3.verris.pl', ns2: 'ns4.verris.pl' } } }).registrarStatus(u);
    expect(r.nameservers).toEqual(['ns3.verris.pl', 'ns4.verris.pl']);
  });

  it('bez hostingu → NS platformy z ustawień, a bez nich pusta lista (nie zmyślone nazwy)', async () => {
    expect((await ctl(null, { ns1: 'a.ns.pl', ns2: 'b.ns.pl', ns3: '' }).registrarStatus(u)).nameservers).toEqual(['a.ns.pl', 'b.ns.pl']);
    expect((await ctl(null).registrarStatus(u)).nameservers).toEqual([]);
  });
});
