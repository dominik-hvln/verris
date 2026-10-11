import { AuditService } from '../../src/common/audit/audit.service.js';
import { PrzegladWezlaService } from '../../src/servers/przeglad-wezla.service.js';
import { ServersService } from '../../src/servers/servers.service.js';
import { StosWezlaService } from '../../src/servers/stos-wezla.service.js';
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

  /**
   * Weryfikacja 11.10 (prod) — karta węzła liczyła konta usunięte: „Konta” 4, a „Pojemność floty” (_count) — 1.
   * To samo w tabeli „Konta na węźle”, obciążeniu węzła (liczba kont) i planie drenażu (usunięte „do przeniesienia”).
   * Ostatnie zadania to historia — zadanie na usuniętym koncie dalej pokazuje jego domenę.
   */
  it('karta węzła, „Konta na węźle”, obciążenie i plan drenażu — bez kont usuniętych', async () => {
    const w = await utworzWezel({ name: 't1', maxAccounts: 10 });
    const plan = await utworzPlan();
    const zywe = await utworzKonto({ serverId: w.id, planId: plan.id });
    const usuniete = [];
    for (let i = 0; i < 3; i++) usuniete.push(await utworzKonto({ serverId: w.id, planId: plan.id, status: 'DELETED', scaledCpu: 50 }));
    await prisma().nodeTask.create({ data: { serverId: w.id, kind: 'PHP_APPLY', status: 'COMPLETED', accountId: usuniete[0]!.account.id } });

    const p = prisma() as never;
    const przeglad = await new PrzegladWezlaService(p, new StosWezlaService(p, new AuditService(p))).przeglad(w.id);
    expect(przeglad.zasoby.konta).toEqual({ razem: 1, limit: 10, autoskalowane: 0 });
    expect(przeglad.zadania[0]!.tekst).toBe(`Zmiana PHP · ${usuniete[0]!.account.domain}`);

    const serwery = new ServersService(prisma() as never, ...(Array(8).fill(null) as []));
    const listaKont = await serwery.getNodeAccounts(w.id);
    expect(listaKont.count).toBe(1);
    expect(listaKont.accounts.map((a) => a.id)).toEqual([zywe.account.id]);

    const obciazenie = await serwery.getNodeUsage(w.id);
    expect(obciazenie.accountCount).toBe(1);
    expect(obciazenie.scaledTotals.cpu).toBe(0);

    const drenaz = await serwery.getNodeMigrationPlan(w.id);
    expect(drenaz.totalAccounts).toBe(1);
    expect(drenaz.accounts.map((a) => a.accountId)).toEqual([zywe.account.id]);
  });
});
