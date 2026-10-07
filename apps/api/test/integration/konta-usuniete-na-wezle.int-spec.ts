import { ServersService } from '../../src/servers/servers.service.js';
import { WafService } from '../../src/subscriptions/waf.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Usunięte konto zostaje w bazie (domena „~usuniete-<id>”), ale nie jest już na węźle:
 * nie liczy się do kont węzła w adminie (lista, szczegóły, wycofanie) i nie ma go w tabeli WAF.
 * Na t1 07.10: „Konta (3)” i trzy wiersze WAF przy jednym żywym koncie.
 */
describe('Węzeł — usunięte konta poza licznikiem i WAF', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('liczy i pokazuje tylko konta, które nie są usunięte', async () => {
    const w = await utworzWezel({ name: 't1' });
    const plan = await utworzPlan();
    const zywe = await utworzKonto({ serverId: w.id, planId: plan.id });
    await utworzKonto({ serverId: w.id, planId: plan.id, status: 'SUSPENDED' });
    await utworzKonto({ serverId: w.id, planId: plan.id, status: 'DELETED' });

    const serwery = new ServersService(prisma() as never, ...(Array(8).fill(null) as []));
    expect((await serwery.getServer(w.id))._count.accounts).toBe(2);
    expect((await serwery.listServers()).find((s) => s.id === w.id)!._count.accounts).toBe(2);

    const waf = await new WafService(prisma() as never, null as never).overviewForServer(w.id);
    expect(waf.accounts.map((a) => a.id).sort()).toEqual(
      (await prisma().account.findMany({ where: { serverId: w.id, status: { not: 'DELETED' } }, select: { id: true } }))
        .map((a) => a.id)
        .sort(),
    );
    expect(waf.accounts.some((a) => a.id === zywe.account.id)).toBe(true);
    expect(waf.accounts).toHaveLength(2);
  });
});
