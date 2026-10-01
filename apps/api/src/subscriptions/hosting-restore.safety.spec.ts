import { HostingRestoreService } from './hosting-restore.service.js';

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
      findFirst: vi.fn().mockResolvedValue(job),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({});
      }),
    },
    account: { findUnique: vi.fn().mockResolvedValue({ userId: 'u1', domain: 'firma.pl' }) },
  };
  let call = 0;
  const da = {
    listHostingBackups: vi.fn().mockImplementation(() => Promise.resolve(lists[Math.min(call++, lists.length - 1)])),
    createHostingSiteBackupNow: vi.fn().mockResolvedValue({ ok: true }),
    restoreHostingBackup: vi.fn().mockResolvedValue({ ok: true }),
  };
  const svc = new (HostingRestoreService as unknown as new (...a: unknown[]) => HostingRestoreService)(prisma, { record: vi.fn() }, da);
  svc.sleep = () => Promise.resolve();
  return { svc, da, updates };
}

const list = (...names: string[]) => ({ rows: names.map((fileName) => ({ fileName })), fetchError: null });

describe('H-09 kopia bezpieczeństwa przed odtworzeniem', () => {
  it('czeka na nowe archiwum i dopiero wtedy odtwarza', async () => {
    const { svc, da, updates } = setup([list('old.tar.gz'), list('old.tar.gz'), list('old.tar.gz', 'safety.tar.gz')]);
    await svc.processNextQueued();
    expect(da.createHostingSiteBackupNow.mock.invocationCallOrder[0]).toBeLessThan(da.restoreHostingBackup.mock.invocationCallOrder[0]);
    // serwer tylko przyjął zlecenie — status zostaje RESTORING do jego potwierdzenia
    expect(updates.some((u) => u.status === 'RESTORING')).toBe(true);
    expect(updates.some((u) => u.status === 'COMPLETED')).toBe(false);
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

describe('Gotowe dopiero po potwierdzeniu serwera (uwaga właściciela 01.10)', () => {
  const zlecono = new Date('2026-10-01T20:29:30Z');
  function konfig(wiadomosci: Array<{ id: string; number: number; subject: string; time: Date }>) {
    const job = { id: 'j1', subscriptionId: 's1', status: 'RESTORING', updatedAt: zlecono, requestedByUserId: 'u1', backupFileName: 'a.tar.zst', safetyBackup: true };
    let status = 'RESTORING';
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      hostingRestoreJob: {
        findMany: vi.fn().mockResolvedValue([job]),
        findUnique: vi.fn().mockImplementation(() => Promise.resolve({ status })),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          if (typeof data.status === 'string') status = data.status;
          return Promise.resolve({});
        }),
      },
      account: { findUnique: vi.fn().mockResolvedValue({ id: 'a1', userId: 'u1' }) },
    };
    const client = {
      listMessages: vi.fn().mockResolvedValue(wiadomosci.map(({ id, number, subject }) => ({ id, number, subject, isNew: true }))),
      getMessage: vi.fn().mockImplementation((id: string) => Promise.resolve({ id, time: wiadomosci.find((w) => w.id === id)!.time })),
    };
    const da = { getClientForHostingAccount: vi.fn().mockResolvedValue(client) };
    const svc = new (HostingRestoreService as unknown as new (...a: unknown[]) => HostingRestoreService)(prisma, { record: vi.fn() }, da);
    return { svc, updates };
  }

  it('wiadomość „przywrócone” nowsza niż zlecenie → COMPLETED z czasem z serwera', async () => {
    const t = new Date('2026-10-01T20:31:35Z');
    const { svc, updates } = konfig([
      { id: '000000072', number: 72, subject: 'Twoje kopie zapasowe są gotowe', time: new Date('2026-10-01T20:30:00Z') },
      { id: '000000073', number: 73, subject: 'Pliki użytkownika zostały przywrócone z kopii zapasowej', time: t },
    ]);
    await svc.potwierdzOdtworzenia(new Date('2026-10-01T20:33:00Z'));
    expect(updates.at(-1)).toMatchObject({ status: 'COMPLETED', completedAt: t });
  });

  it('stara wiadomość „przywrócone” (z poprzedniego odtworzenia) nie zamyka zadania', async () => {
    const { svc, updates } = konfig([
      { id: '000000040', number: 40, subject: 'Pliki użytkownika zostały przywrócone z kopii zapasowej', time: new Date('2026-09-29T13:38:06Z') },
    ]);
    await svc.potwierdzOdtworzenia(new Date('2026-10-01T20:35:00Z'));
    expect(updates).toEqual([]);
  });

  it('brak potwierdzenia przez 2 h → FAILED z wyjaśnieniem dla klienta', async () => {
    const { svc, updates } = konfig([]);
    await svc.potwierdzOdtworzenia(new Date('2026-10-01T22:40:00Z'));
    expect(updates.at(-1)).toMatchObject({ status: 'FAILED', error: expect.stringContaining('nie potwierdził') });
  });
});
