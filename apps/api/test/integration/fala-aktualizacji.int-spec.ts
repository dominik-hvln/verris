import { AuditService } from '../../src/common/audit/audit.service';
import { NodeTasksService } from '../../src/servers/node-tasks.service';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup';

/**
 * PB-32 — aktualizacja floty falą na prawdziwej bazie: kanarek (najmniej kont) pierwszy,
 * następny węzeł dopiero po udanej aktualizacji poprzedniego, błąd zatrzymuje falę.
 */
function serwis() {
  const p = prisma() as never;
  return new NodeTasksService(p, new AuditService(p), null as never);
}

async function wezel(nazwa: string) {
  return utworzWezel({ name: nazwa, identityToken: `tok-${nazwa}` });
}

async function wykonaj(serverId: string, ok: boolean) {
  const t = await prisma().nodeTask.findFirstOrThrow({ where: { serverId, kind: 'FLEET_UPDATE', status: 'QUEUED' } });
  await prisma().nodeTask.update({ where: { id: t.id }, data: { status: 'RUNNING', startedAt: new Date() } });
  if (ok) await serwis().completeTaskFromNode({ serverId, taskId: t.id, outputLog: 'VERRIS_UPDATE_RESULT=ok' });
  else await serwis().failTaskFromNode({ serverId, taskId: t.id, error: 'build all d' });
}

const kolejka = async () =>
  (await prisma().nodeTask.findMany({ where: { kind: 'FLEET_UPDATE', status: 'QUEUED' }, select: { serverId: true } })).map((t) => t.serverId);

describe('PB-32 — aktualizacja floty falą', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('kanarek pierwszy, potem po jednym; koniec fali w audycie', async () => {
    const plan = await utworzPlan();
    const duzy = await wezel('duzy');
    const kanarek = await wezel('kanarek');
    await utworzKonto({ serverId: duzy.id, planId: plan.id });
    await utworzKonto({ serverId: duzy.id, planId: plan.id });

    const r = await serwis().queueFleetUpdate(null);
    expect(r).toMatchObject({ queued: 1, kanarek: kanarek.id });
    expect(await kolejka()).toEqual([kanarek.id]);
    await expect(serwis().queueFleetUpdate(null)).rejects.toMatchObject({ status: 400 });

    await wykonaj(kanarek.id, true);
    expect(await kolejka()).toEqual([duzy.id]);
    await wykonaj(duzy.id, true);
    expect(await kolejka()).toEqual([]);
    expect(await prisma().auditLog.count({ where: { action: 'FLEET_UPDATE_FINISHED' } })).toBe(1);
  });

  it('błąd na kanarku zatrzymuje falę — reszta nie dostaje zadania', async () => {
    const kanarek = await wezel('k2');
    const plan = await utworzPlan();
    const inny = await wezel('inny');
    await utworzKonto({ serverId: inny.id, planId: plan.id });
    await serwis().queueFleetUpdate(null);
    await wykonaj(kanarek.id, false);
    expect(await kolejka()).toEqual([]);
    expect(await prisma().auditLog.count({ where: { action: 'FLEET_UPDATE_STOPPED' } })).toBe(1);
  });
});
