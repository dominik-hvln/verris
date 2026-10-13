import { AuditService } from '../../src/common/audit/audit.service.js';
import { NodeTasksService } from '../../src/servers/node-tasks.service.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { FalaTygodniowaScheduler } from '../../src/servers/fala-tygodniowa.scheduler.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * PB-32 — aktualizacja floty falą na prawdziwej bazie: kanarek (najmniej kont) pierwszy,
 * następny węzeł dopiero po udanej aktualizacji poprzedniego, błąd zatrzymuje falę.
 */
function serwis() {
  const p = prisma() as never;
  return new NodeTasksService(p, new AuditService(p), null as never, undefined, new NotificationsService(p));
}

async function wezel(nazwa: string) {
  return utworzWezel({ name: nazwa, identityToken: `tok-${nazwa}` });
}

async function wykonaj(serverId: string, ok: boolean, wynik = 'ok') {
  const t = await prisma().nodeTask.findFirstOrThrow({ where: { serverId, kind: 'FLEET_UPDATE', status: 'QUEUED' } });
  await prisma().nodeTask.update({ where: { id: t.id }, data: { status: 'RUNNING', startedAt: new Date() } });
  if (ok) await serwis().completeTaskFromNode({ serverId, taskId: t.id, outputLog: `VERRIS_UPDATE_RESULT=${wynik}` });
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

  it('PB-35: fala tygodniowa startuje sama, nie dubluje trwającej, zatrzymanie powiadamia adminów', async () => {
    const admin = await prisma().user.create({ data: { email: `pb35-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const w = await wezel('tyg');
    const cron = new FalaTygodniowaScheduler(serwis());
    expect(await cron.uruchom()).toBe('start');
    expect(await cron.uruchom()).toBe('trwa');
    await wykonaj(w.id, false);
    expect(await prisma().notification.count({ where: { userId: admin.id, title: 'Fala aktualizacji zatrzymana' } })).toBe(1);
  });

  // PB-32 „status w panelu zgodny z logiem”: przebieg fali po węzłach z wynikiem z logu zadania.
  it('stan fali dla panelu: trwa → zakończona (z „wymaga restartu”), a po błędzie — zatrzymana z pozostałymi', async () => {
    expect(await serwis().stanFali()).toBeNull();
    const plan = await utworzPlan();
    const a = await wezel('alfa');
    const b = await wezel('beta');
    await utworzKonto({ serverId: b.id, planId: plan.id });
    await serwis().queueFleetUpdate(null);
    expect(await serwis().stanFali()).toMatchObject({ stan: 'trwa', razem: 2, pozostale: 2, wezly: [{ nr: 1, nazwa: 'alfa', status: 'QUEUED', wynik: null }] });
    await wykonaj(a.id, true, 'needs-reboot');
    await wykonaj(b.id, true);
    const koniec = await serwis().stanFali();
    expect(koniec).toMatchObject({ stan: 'zakonczona', pozostale: 0, wymagaRestartu: ['alfa'] });
    expect(koniec!.wezly.map((w) => [w.nr, w.nazwa, w.status, w.wynik])).toEqual([[1, 'alfa', 'COMPLETED', 'needs-reboot'], [2, 'beta', 'COMPLETED', 'ok']]);

    // Nowa fala — panel pokazuje ją, nie poprzednią.
    await serwis().queueFleetUpdate(null);
    await wykonaj(a.id, false);
    expect(await serwis().stanFali()).toMatchObject({ stan: 'zatrzymana', pozostale: 1, wezly: [{ nazwa: 'alfa', status: 'FAILED', blad: 'build all d' }] });
  });
});
