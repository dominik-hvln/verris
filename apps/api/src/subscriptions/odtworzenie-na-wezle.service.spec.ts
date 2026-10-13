import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OdtworzenieNaWezleService, prefiks, przyczynaBledu } from './odtworzenie-na-wezle.service.js';
import { NodeTasksService } from '../servers/node-tasks.service.js';

const skrypt = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-account-restore.sh'), 'utf8');

function zbuduj(o: { cel?: Record<string, unknown> | null; wToku?: unknown } = {}) {
  const create = vi.fn(async () => ({ id: 't1' }));
  const prisma = {
    subscription: {
      findUnique: vi.fn(async () => ({
        userId: 'u1',
        account: { id: 'a1', daUsername: 'klient1', serverId: 's-stary', server: { hostname: 'node-pl-01.verris.pl' } },
      })),
    },
    server: { findUnique: vi.fn(async () => (o.cel === undefined ? { id: 's-nowy', status: 'ACTIVE', ipAddress: '203.0.113.7' } : o.cel)) },
    nodeTask: { findFirst: vi.fn(async () => o.wToku ?? null), create, findMany: vi.fn(async () => []) },
  };
  const audit = { record: vi.fn() };
  return { s: new OdtworzenieNaWezleService(prisma as never, audit as never), create, audit };
}

describe('H-16 — odtworzenie konta na innym węźle', () => {
  it('prefiks kopii = nodes/<hostname -s> (jak node-offsite-backup.sh)', () => {
    expect(prefiks('node-pl-01.verris.pl')).toBe('nodes/node-pl-01');
    expect(prefiks(null)).toBeNull();
    expect(prefiks('../etc')).toBeNull();
  });

  it('restore idzie na węzeł docelowy z prefiksem źródła i IP celu', async () => {
    const t = zbuduj();
    await t.s.start('sub1', 'admin1', { targetServerId: 's-nowy', archive: 'user.admin.klient1.tar.gz' });
    expect(t.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        serverId: 's-nowy',
        accountId: 'a1',
        payload: expect.objectContaining({ mode: 'restore', sourcePrefix: 'nodes/node-pl-01', ip: '203.0.113.7', przeniesienie: '1', daUser: 'klient1' }),
      }),
    });
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_RESTORE_TO_NODE_QUEUED' }));
  });

  it('odmowy: ten sam węzeł, nieaktywny cel, zła nazwa archiwum, operacja w toku', async () => {
    await expect(zbuduj().s.lista('sub1', 'a', { targetServerId: 's-stary' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(zbuduj({ cel: { id: 's-nowy', status: 'DRAINING' } }).s.lista('sub1', 'a', { targetServerId: 's-nowy' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(zbuduj().s.start('sub1', 'a', { targetServerId: 's-nowy', archive: '../x.tar.gz' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(zbuduj({ wToku: { id: 'x' } }).s.lista('sub1', 'a', { targetServerId: 's-nowy' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('skrypt węzła: restore z panelu tylko z IP, konto istniejące nie jest nadpisywane, ip_choice=select z dokumentacji DA', () => {
    expect(skrypt).toContain('restore) [ -n "${OFR_IP:-}" ] ||');
    expect(skrypt).toContain('już istnieje na tym węźle');
    expect(skrypt).toContain('ipchoice="ip_choice=select&ip=${ip}"');
    expect(skrypt).toContain('VERRIS-OFFSITE-RESTORED');
    expect(skrypt).toContain('BACKUP_PREFIX="$OFR_SOURCE_PREFIX"');
  });

  it.each([
    ['VERRIS-OFFSITE-RESTORED klient1', true],
    ['[FAIL] cos poszlo nie tak', false],
  ])('po zakończeniu zadania (%s) konto przepina się tylko po potwierdzeniu węzła', async (log, przepiete) => {
    const task = zadanieRestore();
    const { prisma, audit } = zakonczenie(task);
    await new NodeTasksService(prisma as never, audit as never, {} as never).completeTaskFromNode({ serverId: 's-nowy', taskId: 't1', outputLog: log });
    if (przepiete) {
      expect(prisma.account.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', serverId: 's-stary' }, data: { serverId: 's-nowy' } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_MOVED_TO_NODE' }));
    } else {
      expect(prisma.account.updateMany).not.toHaveBeenCalled();
    }
  });

  // 13.10 — przepięcie rdeetgju t1→t2 bez księgi: asercja Z-16 po migracji cofnęła wdrożenie
  // („2 węzłów ma księgę niezgodną z sumą limitów kont żywych”).
  it('przepięcie przenosi limity konta w księdze pojemności (Z-16): stary węzeł −, nowy +', async () => {
    const { prisma, audit } = zakonczenie(zadanieRestore());
    await new NodeTasksService(prisma as never, audit as never, {} as never).completeTaskFromNode({
      serverId: 's-nowy', taskId: 't1', outputLog: 'VERRIS-OFFSITE-RESTORED klient1',
    });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: 's-stary' },
      data: { allocatedCpu: { increment: -100 }, allocatedMemory: { increment: -1024 }, allocatedDisk: { increment: -10240 } },
    });
    expect(prisma.server.update).toHaveBeenCalledWith({
      where: { id: 's-nowy' },
      data: { allocatedCpu: { increment: 100 }, allocatedMemory: { increment: 1024 }, allocatedDisk: { increment: 10240 } },
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('ponowiony raport (konto już na nowym węźle) i wyścig nie przenoszą księgi drugi raz', async () => {
    const juz = zakonczenie(zadanieRestore(), { serverId: 's-nowy' });
    await new NodeTasksService(juz.prisma as never, juz.audit as never, {} as never).completeTaskFromNode({
      serverId: 's-nowy', taskId: 't1', outputLog: 'VERRIS-OFFSITE-RESTORED klient1',
    });
    expect(juz.prisma.server.update).not.toHaveBeenCalled();

    const wyscig = zakonczenie(zadanieRestore(), {}, 0);
    await new NodeTasksService(wyscig.prisma as never, wyscig.audit as never, {} as never).completeTaskFromNode({
      serverId: 's-nowy', taskId: 't1', outputLog: 'VERRIS-OFFSITE-RESTORED klient1',
    });
    expect(wyscig.prisma.server.update).not.toHaveBeenCalled();
  });

  it('konto usunięte (poza księgą) — przepięcie bez ruchu księgi', async () => {
    const { prisma, audit } = zakonczenie(zadanieRestore(), { status: 'DELETED' });
    await new NodeTasksService(prisma as never, audit as never, {} as never).completeTaskFromNode({
      serverId: 's-nowy', taskId: 't1', outputLog: 'VERRIS-OFFSITE-RESTORED klient1',
    });
    expect(prisma.account.updateMany).toHaveBeenCalled();
    expect(prisma.server.update).not.toHaveBeenCalled();
  });
});

function zadanieRestore() {
  return {
    id: 't1', serverId: 's-nowy', status: 'RUNNING', kind: 'OFFSITE_RESTORE', accountId: 'a1',
    payload: { mode: 'restore', przeniesienie: '1', daUser: 'klient1' },
    createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: new Date(),
  };
}

function zakonczenie(task: object, konto: Record<string, unknown> = {}, przepieto = 1) {
  const prisma = {
    nodeTask: { findUnique: vi.fn(async () => task), update: vi.fn(async () => task) },
    account: {
      findUnique: vi.fn(async () => ({
        serverId: 's-stary', userId: 'u1', status: 'ACTIVE', cpuLimit: 100, ramLimitMb: 1024, diskLimitMb: 10240, ...konto,
      })),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: przepieto })),
    },
    server: { update: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma, audit: { record: vi.fn() } };
}

describe('przyczynaBledu — co operator widzi przy nieudanym zadaniu (13.10, t2)', () => {
  const NAGLOWEK = '=== Verris task ed91 (kind=OFFSITE_RESTORE) ===\nStart: 2026-10-13T15:07:29Z\nCommand: /usr/local/bin/verris-account-restore.sh \n---\n';

  it('pusty log z kodem wyjścia → kod, nie nagłówek logu', () => {
    const log = `${NAGLOWEK}---\nEnd: 2026-10-13T15:07:29Z rc=2\n`;
    const splaszczony = log.replace(/\n/g, ' ');
    expect(przyczynaBledu(log, splaszczony)).toContain('kodem 2');
    expect(przyczynaBledu(log, splaszczony)).not.toContain('Verris task');
  });

  it('[FAIL] ze skryptu ma pierwszeństwo, także w spłaszczonym komunikacie', () => {
    const log = `${NAGLOWEK}[2026-10-13T15:07:29Z] pobieram…\n[2026-10-13T15:07:30Z] [FAIL] konto rdeetgju już istnieje na tym węźle\n---\nEnd: x rc=1\n`;
    expect(przyczynaBledu(log)).toBe('[FAIL] konto rdeetgju już istnieje na tym węźle');
    expect(przyczynaBledu(null, log.replace(/\n/g, ' '))).toMatch(/^\[FAIL\] konto rdeetgju już istnieje na tym węźle/);
  });

  it('bez [FAIL] → ostatnia linia treści', () => {
    expect(przyczynaBledu(`${NAGLOWEK}rclone copy nieudany\n---\nEnd: x rc=1\n`)).toBe('rclone copy nieudany');
  });
});
