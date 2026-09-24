import { ConflictException } from '@nestjs/common';
import { DiskUsageService, zajetoscZLogu } from './disk-usage.service';

/** C-15/K-03 — skrypt węzła sprawdzony lokalnie (du jako klient, dwa poziomy, i-węzły). */
function stanowisko(opts: { zadania?: unknown[]; wToku?: boolean } = {}) {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: jest.fn(async () => (opts.wToku ? { id: 'x' } : null)),
      findMany: jest.fn(async () => opts.zadania ?? []),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  return { svc: new DiskUsageService(prisma as never), prisma };
}

describe('DiskUsageService', () => {
  it('zlecenie: zadanie DISK_USAGE z loginem konta; drugie w toku → 409', async () => {
    const s = stanowisko();
    await s.svc.policz('s1', 'u1');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'DISK_USAGE', payload: { daUser: 'klient1' } }) });
    await expect(stanowisko({ wToku: true }).svc.policz('s1', 'u1')).rejects.toThrow(ConflictException);
  });

  it('wynik z logu: suma, katalogi, brak liczby plików gdy du --inodes nie zadziałał', () => {
    const r = zajetoscZLogu('VERRIS_DU_RAZEM 428|36\nVERRIS_DU 312|5|imap\nVERRIS_DU 72|-1|domains/a b.pl\n[disk-usage] Gotowe.');
    expect(r.razem).toEqual({ kb: 428, pliki: 36 });
    expect(zajetoscZLogu('VERRIS_DU_SKRZYNKA 304|x.pl|Jan\n').skrzynki).toEqual([{ email: 'jan@x.pl', kb: 304 }]);
    expect(r.wpisy).toEqual([
      { kb: 312, pliki: 5, sciezka: 'imap' },
      { kb: 72, pliki: null, sciezka: 'domains/a b.pl' },
    ]);
  });

  it('status: ostatni udany pomiar + błąd najnowszej próby', async () => {
    const d = new Date('2026-09-24T10:00:00Z');
    const s = stanowisko({
      zadania: [
        { status: 'FAILED', outputLog: '[disk-usage] BŁĄD: nie udało się policzyć zajętości', createdAt: d },
        { status: 'COMPLETED', outputLog: 'VERRIS_DU_RAZEM 10|2\n', createdAt: d, completedAt: d },
      ],
    });
    const r = await s.svc.status('s1', 'u1');
    expect(r).toMatchObject({ policzono: d.toISOString(), razem: { kb: 10, pliki: 2 }, blad: 'nie udało się policzyć zajętości' });
  });
});
