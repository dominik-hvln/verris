import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OdtworzenieNaWezleService, prefiks } from './odtworzenie-na-wezle.service.js';
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
    const task = {
      id: 't1', serverId: 's-nowy', status: 'RUNNING', kind: 'OFFSITE_RESTORE', accountId: 'a1',
      payload: { mode: 'restore', przeniesienie: '1', daUser: 'klient1' },
      createdAt: new Date(), updatedAt: new Date(), startedAt: null, completedAt: new Date(),
    };
    const prisma = {
      nodeTask: { findUnique: vi.fn(async () => task), update: vi.fn(async () => task) },
      account: { findUnique: vi.fn(async () => ({ serverId: 's-stary', userId: 'u1' })), update: vi.fn() },
    };
    const audit = { record: vi.fn() };
    await new NodeTasksService(prisma as never, audit as never, {} as never).completeTaskFromNode({ serverId: 's-nowy', taskId: 't1', outputLog: log });
    if (przepiete) {
      expect(prisma.account.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { serverId: 's-nowy' } });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCOUNT_MOVED_TO_NODE' }));
    } else {
      expect(prisma.account.update).not.toHaveBeenCalled();
    }
  });
});
