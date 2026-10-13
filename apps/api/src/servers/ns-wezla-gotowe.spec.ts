import { nsBezAdresu } from './servers.service.js';

/**
 * 13.10 (t2) — węzeł bez działającej pary NS nie przyjmuje nowych kont. Sprawdzenie: oba NS mają rekord A.
 * Na t2 efektywne NS to ns1/ns2.verris.pl (brak w DNS), w strefie DA ns1/ns2.t2.verris.pl (też brak).
 */
describe('nsBezAdresu — NS węzła, które nie rozwiązują się w DNS', () => {
  const dns: Record<string, string[]> = { 'ns3.verris.pl': ['2.28.204.249'], 'ns4.verris.pl': ['2.28.204.249'] };
  const resolve = async (h: string) => {
    if (h in dns) return dns[h];
    throw Object.assign(new Error(`queryA ENOTFOUND ${h}`), { code: 'ENOTFOUND' });
  };

  it('para t1 (ns3/ns4) rozwiązuje się → nic do zgłoszenia', async () => {
    await expect(nsBezAdresu(['ns3.verris.pl', 'ns4.verris.pl'], resolve)).resolves.toEqual([]);
  });

  it('t2 z ns1/ns2.verris.pl bez rekordów → oba zgłoszone', async () => {
    await expect(nsBezAdresu(['ns1.verris.pl', 'ns2.verris.pl'], resolve)).resolves.toEqual(['ns1.verris.pl', 'ns2.verris.pl']);
  });

  it('pusta odpowiedź DNS też jest brakiem', async () => {
    await expect(nsBezAdresu(['ns9.verris.pl'], async () => [])).resolves.toEqual(['ns9.verris.pl']);
  });
});
