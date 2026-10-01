import { BackupScheduleService } from '../../src/subscriptions/backup-schedule.service.js';
import { BackupOffsiteService } from '../../src/servers/backup-offsite.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * H-03 — wybór klienta zapisany w panelu trafia do listy `<login> <dni>` dla węzła (GET
 * /agent/tasks/backup-retention) w granicach planu — także po obniżeniu limitu planu.
 */
describe('Retencja kopii poza serwerem: panel → węzeł', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('lista dla węzła: wybór klienta, minimum dla konta bez wyboru, bez kont usuniętych i obcych węzłów', async () => {
    const w = await utworzWezel();
    const inny = await utworzWezel();
    const planDluzszy = await utworzPlan({ offsiteRetentionMaxDays: 60 });
    const planPodstawowy = await utworzPlan();
    const a = await utworzKonto({ serverId: w.id, planId: planDluzszy.id });
    const b = await utworzKonto({ serverId: w.id, planId: planPodstawowy.id });
    await utworzKonto({ serverId: w.id, planId: planDluzszy.id, status: 'DELETED' });
    await utworzKonto({ serverId: inny.id, planId: planDluzszy.id });

    const kopie = new BackupScheduleService(prisma() as never, {} as never);
    const wezel = new BackupOffsiteService(prisma() as never, {} as never, {} as never);

    await expect(kopie.ustawRetencjeOffsite(a.subscription.id, a.user.id, 60)).resolves.toMatchObject({ dni: 60, max: 60 });
    await expect(kopie.ustawRetencjeOffsite(b.subscription.id, b.user.id, 45)).rejects.toMatchObject({ status: 400 });
    expect(await wezel.retencjaKontDlaWezla(w.id)).toBe(
      [`${a.account.daUsername} 60`, `${b.account.daUsername} 30`].sort().join('\n') + '\n',
    );

    // Plan obniżony — węzeł od razu dostaje nowy sufit, klient widzi to samo.
    await prisma().plan.update({ where: { id: planDluzszy.id }, data: { offsiteRetentionMaxDays: 45 } });
    expect(await wezel.retencjaKontDlaWezla(w.id)).toContain(`${a.account.daUsername} 45\n`);
    await expect(kopie.retencjaOffsite(a.subscription.id, a.user.id)).resolves.toEqual({ dni: 45, min: 30, max: 45 });
  });
});
