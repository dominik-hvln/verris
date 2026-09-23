import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OffsiteRestoreService } from './offsite-restore.service';

/**
 * X-08 — ścieżka odtwarzania z kopii off-site: wejście od klienta trafia do skryptu
 * na węźle, więc nazwa archiwum i wersja kopii są granicą zaufania.
 */
function zbuduj(opts: { wlasciciel?: boolean; wToku?: boolean; zadania?: Array<Record<string, unknown>> } = {}) {
  const konto = { id: 'acc1', status: 'ACTIVE', daUsername: 'klient1', serverId: 'srv1', domain: 'x.pl', server: null };
  const prisma = {
    subscription: {
      findFirst: jest.fn(async () => (opts.wlasciciel === false ? null : { id: 's1', userId: 'u1', account: konto })),
    },
    account: { findUnique: jest.fn(async () => konto) },
    nodeTask: {
      findFirst: jest.fn(async () => (opts.wToku ? { id: 't0' } : null)),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 't1', ...data })),
      findMany: jest.fn(async () => opts.zadania ?? []),
    },
  };
  const audit = { record: jest.fn(async () => undefined) };
  return { svc: new OffsiteRestoreService(prisma as never, audit as never), prisma, audit };
}

describe('OffsiteRestoreService — X-08', () => {
  it.each([
    '../../etc/passwd.tar.gz',
    '/home/inny/backup.tar.gz',
    'a/b.tar.gz',
    '.ukryty.tar.gz',
    'x.tar.gz;rm -rf ~',
    'x.tar.gz\nmode=list',
    'x.zip',
    '$(id).tar',
    '',
  ])('odrzuca nazwę archiwum %j zanim cokolwiek trafi na węzeł', async (nazwa) => {
    const { svc, prisma } = zbuduj();
    await expect(svc.queueFetch('s1', 'u1', nazwa)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.nodeTask.create).not.toHaveBeenCalled();
  });

  it('przyjmuje zwykłą nazwę kopii DA; użytkownik DA pochodzi z konta, nie z wejścia', async () => {
    const { svc, prisma, audit } = zbuduj();
    await svc.queueFetch('s1', 'u1', ' user.klient1.2026-09-20.tar.zst ', '20260920');
    const data = (prisma.nodeTask.create.mock.calls[0] as unknown as [{ data: { payload: Record<string, string> } }])[0].data;
    expect(data.payload).toEqual({ mode: 'fetch', daUser: 'klient1', archive: 'user.klient1.2026-09-20.tar.zst', snapshot: '20260920' });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: expect.stringContaining('OFFSITE_FETCH') }));
  });

  it.each(['2026-09-20', '2026092', '20260920; ls', 'latest'])('odrzuca wersję kopii %j', async (snap) => {
    const { svc, prisma } = zbuduj();
    await expect(svc.queueList('s1', 'u1', snap)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.nodeTask.create).not.toHaveBeenCalled();
  });

  it('cudza usługa → 404; trwające zadanie → 409 (bez drugiego zadania)', async () => {
    await expect(zbuduj({ wlasciciel: false }).svc.queueList('s1', 'intruz')).rejects.toBeInstanceOf(NotFoundException);
    const b = zbuduj({ wToku: true });
    await expect(b.svc.queueList('s1', 'u1')).rejects.toBeInstanceOf(ConflictException);
    expect(b.prisma.nodeTask.create).not.toHaveBeenCalled();
  });

  it('lista z logu węzła pomija wiersze z niebezpieczną nazwą i sortuje od najnowszej', async () => {
    const log = [
      'rclone: listing…',
      'VERRIS-OFFSITE-FILE stara.tar.gz|100|2026-09-01 03:00:00',
      'VERRIS-OFFSITE-FILE ../../zlo.tar.gz|1|2026-09-22 03:00:00',
      'VERRIS-OFFSITE-FILE nowa.tar.gz|200|2026-09-20 03:00:00',
      'VERRIS-OFFSITE-FILE bez-rozmiaru.tar||',
    ].join('\n');
    const { svc } = zbuduj({
      zadania: [{ id: 't', status: 'COMPLETED', payload: { mode: 'list' }, outputLog: log, completedAt: new Date(), updatedAt: new Date(), createdAt: new Date(), errorMessage: null }],
    });
    const stan = await svc.status('s1', 'u1');
    expect(stan.archives.map((a) => a.name)).toEqual(['nowa.tar.gz', 'stara.tar.gz', 'bez-rozmiaru.tar']);
    expect(stan.archives[2]).toMatchObject({ sizeBytes: null, modifiedAt: null });
  });

  it('błąd z węzła nie wycieka do klienta surowym logiem', async () => {
    const { svc } = zbuduj({
      zadania: [{ id: 't', status: 'FAILED', payload: { mode: 'fetch' }, errorMessage: 'rclone copy: /etc/verris-backup.conf RCLONE_REMOTE=s3:secret', createdAt: new Date(), completedAt: null, updatedAt: new Date() }],
    });
    const stan = await svc.status('s1', 'u1');
    expect(stan.lastFetch?.errorMessage).toBe('Kopia off-site nie jest jeszcze skonfigurowana dla tego serwera. Napisz do nas.');
    expect(JSON.stringify(stan)).not.toContain('secret');
  });
});
