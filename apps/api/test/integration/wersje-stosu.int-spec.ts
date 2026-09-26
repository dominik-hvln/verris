import { AuditService } from '../../src/common/audit/audit.service';
import { NodeTasksService } from '../../src/servers/node-tasks.service';
import { StosWezlaService } from '../../src/servers/stos-wezla.service';
import { nastepnyKrokMariadb, stosJakoEnv } from '../../src/servers/stos-wezla';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup';

/**
 * PB-33 — wersje stosu w panelu: zapis podbija wersję manifestu, zła wartość odpada,
 * „Wyrównaj flotę” prowadzi MariaDB krok po kroku (10.6 → 10.11 → 11.4) zadaniami z kopią bazy.
 */
function uslugi() {
  const p = prisma() as never;
  const audit = new AuditService(p);
  const stos = new StosWezlaService(p, audit);
  const tasks = new NodeTasksService(p, audit, null as never, undefined, undefined, stos);
  return { stos, tasks };
}

async function zakoncz(serverId: string, kind: 'FLEET_UPDATE' | 'DB_UPGRADE') {
  const t = await prisma().nodeTask.findFirstOrThrow({ where: { serverId, kind, status: 'QUEUED' } });
  await prisma().nodeTask.update({ where: { id: t.id }, data: { status: 'RUNNING', startedAt: new Date() } });
  await uslugi().tasks.completeTaskFromNode({ serverId, taskId: t.id, outputLog: 'VERRIS_UPDATE_RESULT=ok' });
  return t;
}

describe('PB-33 — wersje stosu floty', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('zapis w panelu podbija wersję manifestu i trafia do pliku dla węzłów; zła wartość odpada', async () => {
    const { stos } = uslugi();
    const admin = await prisma().user.create({ data: { email: `pb33-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const m1 = await stos.zapisz({ daKanal: 'stable', daCommit: '', php1: '8.4', mariadb: '11.4', litespeedLinia: '6.3' }, admin.id);
    const m2 = await stos.zapisz({ daKanal: 'stable', daCommit: 'abc1234', php1: '8.4', mariadb: '10.11', litespeedLinia: '6.3' }, admin.id);
    expect(m2.wersja).not.toBe(m1.wersja);
    expect(m2.governorMysql).toBe('mariadb1011');
    expect(stosJakoEnv(await stos.pobierz())).toContain("VERRIS_PHP1_RELEASE='8.4'");
    await expect(stos.zapisz({ daKanal: 'stable', daCommit: '', php1: '7.4', mariadb: '11.4', litespeedLinia: '6.3' }, admin.id)).rejects.toMatchObject({ status: 400 });
    await expect(stos.zapisz({ daKanal: 'stable', daCommit: '', php1: '8.4', mariadb: '11.8', litespeedLinia: '6.3' }, admin.id)).rejects.toMatchObject({ status: 400 });
    expect(await prisma().auditLog.count({ where: { action: 'STACK_MANIFEST_UPDATED' } })).toBe(2);
  });

  it('wyrównanie: fala przekazuje tryb węzłowi, a MariaDB idzie po jednym kroku aż do manifestu', async () => {
    const { tasks } = uslugi();
    const w = await utworzWezel({ name: 'stary', identityToken: 'tok-stary', dbVersion: '10.6.21' });
    await tasks.queueFleetUpdate(null, { wyrownaj: true });
    const fala = await zakoncz(w.id, 'FLEET_UPDATE');
    expect(fala.payload).toMatchObject({ wyrownaj: '1' });

    const k1 = await prisma().nodeTask.findFirstOrThrow({ where: { serverId: w.id, kind: 'DB_UPGRADE', status: 'QUEUED' } });
    expect(k1.payload).toMatchObject({ version: '10.11', lancuch: '1' });
    await zakoncz(w.id, 'DB_UPGRADE');
    const k2 = await prisma().nodeTask.findFirstOrThrow({ where: { serverId: w.id, kind: 'DB_UPGRADE', status: 'QUEUED' } });
    expect(k2.payload).toMatchObject({ version: '11.4' });
    await zakoncz(w.id, 'DB_UPGRADE');
    expect(await prisma().nodeTask.count({ where: { serverId: w.id, status: 'QUEUED' } })).toBe(0);
  });

  it('zwykła fala (bez wyrównania) nie rusza wersji MariaDB', async () => {
    const { tasks } = uslugi();
    const w = await utworzWezel({ name: 'zwykly', identityToken: 'tok-zwykly', dbVersion: '10.6.21' });
    await tasks.queueFleetUpdate(null);
    await zakoncz(w.id, 'FLEET_UPDATE');
    expect(await prisma().nodeTask.count({ where: { serverId: w.id, kind: 'DB_UPGRADE' } })).toBe(0);
  });

  it('ścieżka kroków MariaDB', () => {
    expect(nastepnyKrokMariadb('10.6.21', '11.4')).toBe('10.11');
    expect(nastepnyKrokMariadb('10.11.19', '11.4')).toBe('11.4');
    expect(nastepnyKrokMariadb('11.4.13', '11.4')).toBeNull();
    expect(nastepnyKrokMariadb('11.4.13', '10.11')).toBeNull();
    expect(nastepnyKrokMariadb(null, '11.4')).toBeNull();
  });
});
