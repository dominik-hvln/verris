import { DomainsController } from './domains.controller.js';

/** t1 04.10 — kreator domeny podpowiadał ns1/ns2.verris.pl, których nie ma w DNS; węzeł t1 to ns3/ns4. */
describe('domyślne NS nowej domeny (registrar/status)', () => {
  const ctl = (sub: unknown, platform = { ns1: '', ns2: '', ns3: '' }, wezelPuli: unknown = null) =>
    new DomainsController(
      {} as never,
      {} as never,
      { get: () => undefined } as never,
      { getRates: async () => ({}) } as never,
      { subscription: { findFirst: vi.fn(async () => sub) }, server: { findFirst: vi.fn(async () => wezelPuli) } } as never,
      { getHostingNameservers: vi.fn(async () => platform) } as never,
    );
  const u = { userId: 'u1' };

  it('NS węzła aktywnego hostingu klienta', async () => {
    const r = await ctl({ account: { server: { ns1: 'ns3.verris.pl', ns2: 'ns4.verris.pl' } } }).registrarStatus(u);
    expect(r.nameservers).toEqual(['ns3.verris.pl', 'ns4.verris.pl']);
  });

  it('bez hostingu → NS platformy z ustawień, potem NS węzła z puli, a bez nich pusta lista (nie zmyślone nazwy)', async () => {
    const wezel = { ns1: 'ns3.verris.pl', ns2: 'ns4.verris.pl' };
    expect((await ctl(null, { ns1: 'a.ns.pl', ns2: 'b.ns.pl', ns3: '' }, wezel).registrarStatus(u)).nameservers).toEqual(['a.ns.pl', 'b.ns.pl']);
    // t1 04.10: ustawienia platformy puste, a węzeł t1 dostał ns3/ns4 przy dodaniu do puli
    expect((await ctl(null, undefined, wezel).registrarStatus(u)).nameservers).toEqual(['ns3.verris.pl', 'ns4.verris.pl']);
    expect((await ctl(null).registrarStatus(u)).nameservers).toEqual([]);
  });
});
