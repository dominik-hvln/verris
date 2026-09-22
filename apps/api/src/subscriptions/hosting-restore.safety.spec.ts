import { HostingRestoreService } from './hosting-restore.service';

/** H-09 — odtwarzanie rusza dopiero, gdy kopia bezpieczeństwa naprawdę powstała. */
function setup(lists: Array<{ rows: { fileName: string }[]; fetchError: string | null }>) {
  const job = {
    id: 'j1',
    subscriptionId: 's1',
    status: 'QUEUED',
    safetyBackup: true,
    backupFileName: 'old.tar.gz',
    scopeFiles: true,
    scopeDatabases: true,
    scopeEmail: false,
    requestedByUserId: 'u1',
  };
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    hostingRestoreJob: {
      findFirst: jest.fn().mockResolvedValue(job),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({});
      }),
    },
    account: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1', domain: 'firma.pl' }) },
  };
  let call = 0;
  const da = {
    listHostingBackups: jest.fn().mockImplementation(() => Promise.resolve(lists[Math.min(call++, lists.length - 1)])),
    createHostingSiteBackupNow: jest.fn().mockResolvedValue({ ok: true }),
    restoreHostingBackup: jest.fn().mockResolvedValue({ ok: true }),
  };
  const svc = new (HostingRestoreService as unknown as new (...a: unknown[]) => HostingRestoreService)(prisma, { record: jest.fn() }, da);
  svc.sleep = () => Promise.resolve();
  return { svc, da, updates };
}

const list = (...names: string[]) => ({ rows: names.map((fileName) => ({ fileName })), fetchError: null });

describe('H-09 kopia bezpieczeństwa przed odtworzeniem', () => {
  it('czeka na nowe archiwum i dopiero wtedy odtwarza', async () => {
    const { svc, da, updates } = setup([list('old.tar.gz'), list('old.tar.gz'), list('old.tar.gz', 'safety.tar.gz')]);
    await svc.processNextQueued();
    expect(da.createHostingSiteBackupNow.mock.invocationCallOrder[0]).toBeLessThan(da.restoreHostingBackup.mock.invocationCallOrder[0]);
    expect(updates.at(-1)).toMatchObject({ status: 'COMPLETED' });
  });

  it('kopia nie powstała → odtwarzanie się nie zaczyna, zadanie FAILED z wyjaśnieniem', async () => {
    const { svc, da, updates } = setup([list('old.tar.gz')]);
    await svc.processNextQueued();
    expect(da.restoreHostingBackup).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED', error: expect.stringContaining('dane nie zostały zmienione') });
  });

  it('nie da się odczytać listy kopii → nie ryzykujemy', async () => {
    const { svc, da } = setup([{ rows: [], fetchError: 'timeout' }]);
    await svc.processNextQueued();
    expect(da.createHostingSiteBackupNow).not.toHaveBeenCalled();
    expect(da.restoreHostingBackup).not.toHaveBeenCalled();
  });
});
