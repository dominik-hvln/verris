import { BadRequestException, ConflictException } from '@nestjs/common';
import { DbTransferService, bladDlaKlienta, wynikZLogu } from './db-transfer.service';

/**
 * D-12 — zlecanie eksportu/importu bazy. Skrypt na węźle sprawdzony na prawdziwej MariaDB 10.11
 * (2026-09-24): plik obcej bazy i `USE inna_baza` → odmowa uprawnień, dowiązanie do pliku roota →
 * „brak pliku”, kopia przed importem, sprzątnięty tymczasowy użytkownik. Tu: strona API.
 */
function stanowisko(o: { wToku?: boolean; status?: string } = {}) {
  const account = { id: 'a1', serverId: 'n1', status: o.status ?? 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: jest.fn(async () => (o.wToku ? { id: 't0' } : null)),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const da = { listHostingDbTransferFiles: jest.fn(async () => ({ pliki: [], bladPlikow: null })) };
  return { svc: new DbTransferService(prisma as never, audit as never, da as never), prisma, audit };
}

describe('DbTransferService', () => {
  it('eksport: zadanie DB_TRANSFER z loginem z rekordu konta, nie z wejścia', async () => {
    const s = stanowisko();
    await s.svc.zlecEksport('s1', 'u1', 'klient1_sklep');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      kind: 'DB_TRANSFER', accountId: 'a1', serverId: 'n1', payload: { mode: 'export', db: 'klient1_sklep', daUser: 'klient1' },
    }) });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DB_EXPORT_QUEUED' }));
  });

  it.each(['obcy_baza', 'klient1', 'klient1_x;DROP', 'klient1Xsklep', "klient1_a' OR 1"])('baza spoza konta (%s) → 400 bez zadania', async (db) => {
    const s = stanowisko();
    await expect(s.svc.zlecEksport('s1', 'u1', db)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prisma.nodeTask.create).not.toHaveBeenCalled();
  });

  it.each(['../../etc/passwd.sql', 'plik.txt', '.ukryty.sql', 'a b.sql', 'x.sql.gz.sh'])('import: zły plik (%s) → 400', async (file) => {
    const s = stanowisko();
    await expect(s.svc.zlecImport('s1', 'u1', 'klient1_sklep', file)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.prisma.nodeTask.create).not.toHaveBeenCalled();
  });

  it('D-18: naprawa/optymalizacja tabel jako DB_TRANSFER; wynik z liczbą tabel i uwagami', async () => {
    const s = stanowisko();
    await s.svc.zlecKonserwacje('s1', 'u1', 'klient1_sklep', 'optimize');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payload: { mode: 'optimize', db: 'klient1_sklep', daUser: 'klient1' } }) });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DB_MAINTENANCE_QUEUED' }));
    await expect(s.svc.zlecKonserwacje('s1', 'u1', 'klient1_sklep', 'drop' as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.zlecKonserwacje('s1', 'u1', 'obcy_baza', 'repair')).rejects.toBeInstanceOf(BadRequestException);
    s.prisma.nodeTask.findMany.mockResolvedValueOnce([
      { id: 't', status: 'COMPLETED', payload: { mode: 'repair', db: 'klient1_sklep' }, outputLog: 'VERRIS_DB_TABELE=3\nVERRIS_DB_UWAGA=t2: repaired\n', errorMessage: null, createdAt: new Date(), completedAt: new Date() },
    ] as never);
    const r = await s.svc.status('s1', 'u1');
    expect(r.zadania[0]).toMatchObject({ tryb: 'repair', tabele: 3, uwagi: ['t2: repaired'] });
  });

  it('drugie zadanie w toku → 409; konto nieaktywne → 400', async () => {
    await expect(stanowisko({ wToku: true }).svc.zlecImport('s1', 'u1', 'klient1_sklep', 'kopia.sql.gz')).rejects.toBeInstanceOf(ConflictException);
    await expect(stanowisko({ status: 'SUSPENDED' }).svc.zlecEksport('s1', 'u1', 'klient1_sklep')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('wynik i błąd z logu: ostatni plik w katalogu baz, powód po ludzku, bez ścieżek systemu', () => {
    const log = [
      '[db-transfer] kopia bazy przed importem…',
      'VERRIS_WYNIK_PLIK=verris-bazy/klient1_sklep-przed-importem-20260924-174753-655a.sql.gz',
      "ERROR 1044 (42000) at line 1: Access denied for user 'vt_1'@'localhost' to database 'obcy_baza'",
      '[db-transfer] BŁĄD: import przerwany — baza mogła zostać zmieniona częściowo. Przywrócisz ją importem pliku ~/verris-bazy/x.sql.gz',
    ].join('\n');
    expect(wynikZLogu(log)).toBe('verris-bazy/klient1_sklep-przed-importem-20260924-174753-655a.sql.gz');
    expect(wynikZLogu('VERRIS_WYNIK_PLIK=/etc/shadow')).toBeNull();
    expect(bladDlaKlienta(log, 'rc=1')).toMatch(/^import przerwany .* Powód: ERROR 1044 .*obcy_baza/);
    expect(bladDlaKlienta('[db-transfer] BŁĄD: brak pliku /home/klient1/verris-bazy/a.sql', null)).toBe('brak pliku ~/verris-bazy/a.sql');
  });
});
