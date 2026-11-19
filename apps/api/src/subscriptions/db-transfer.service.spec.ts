import { BadRequestException, ConflictException, PayloadTooLargeException } from '@nestjs/common';
import { DirectAdminApiError } from '@verris/directadmin-sdk';
import { DbTransferService, MAX_PLIKU_BAZY, bladDlaKlienta, rozmiaryZLogu, wynikZLogu } from './db-transfer.service.js';

/**
 * D-12 — zlecanie eksportu/importu bazy. Skrypt na węźle sprawdzony na prawdziwej MariaDB 10.11
 * (2026-09-24): plik obcej bazy i `USE inna_baza` → odmowa uprawnień, dowiązanie do pliku roota →
 * „brak pliku”, kopia przed importem, sprzątnięty tymczasowy użytkownik. Tu: strona API.
 */
function stanowisko(o: { wToku?: boolean; status?: string; katalog?: { name: string }[] | null } = {}) {
  const account = { id: 'a1', serverId: 'n1', status: o.status ?? 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: vi.fn(async () => (o.wToku ? { id: 't0' } : null)),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const klient = {
    // null = katalogu verris-bazy jeszcze nie ma (DA odpowiada błędem, jak przed pierwszym eksportem)
    listDir: vi.fn(async () => {
      if (o.katalog === null) throw new DirectAdminApiError('Path does not exist', 'Path does not exist');
      return o.katalog ?? [];
    }),
    makeDir: vi.fn(async () => undefined),
    uploadFile: vi.fn(async () => undefined),
  };
  const da = {
    listHostingDbTransferFiles: vi.fn(async () => ({ pliki: [], bladPlikow: null })),
    getClientForHostingAccount: vi.fn(async () => klient),
  };
  return { svc: new DbTransferService(prisma as never, audit as never, da as never), prisma, audit, klient, da };
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

  it('D-08: uprawnienia użytkownika tylko dla bazy i użytkownika konta; ostatni zestaw w stanie', async () => {
    const s = stanowisko();
    await s.svc.zlecUprawnienia('s1', 'u1', 'klient1_sklep', 'klient1_app', 'ro');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payload: { mode: 'privileges', db: 'klient1_sklep', user: 'klient1_app', privs: 'ro', daUser: 'klient1' } }) });
    await expect(s.svc.zlecUprawnienia('s1', 'u1', 'klient1_sklep', 'obcy_app', 'ro')).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.zlecUprawnienia('s1', 'u1', 'klient1_sklep', 'klient1_app', 'grant' as never)).rejects.toBeInstanceOf(BadRequestException);
    const z = (privs: string, status: string) => ({ id: privs, status, payload: { mode: 'privileges', db: 'klient1_sklep', user: 'klient1_app', privs }, outputLog: '', errorMessage: null, createdAt: new Date(), completedAt: null });
    s.prisma.nodeTask.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([z('full', 'FAILED'), z('rw', 'COMPLETED'), z('ro', 'COMPLETED')] as never);
    const r = await s.svc.status('s1', 'u1');
    // Nowsza nieudana zmiana nie przesłania działającego zestawu, ale jest widoczna (test D3 29.09).
    expect(r.uprawnienia).toEqual({ 'klient1_sklep|klient1_app': { zestaw: 'rw', status: 'COMPLETED', nieudana: 'full' } });
    // Jedyna próba nieudana → domyślne pełne + informacja; starsza nieudana przed udaną → bez informacji.
    s.prisma.nodeTask.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([z('ro', 'FAILED')] as never);
    expect((await s.svc.status('s1', 'u1')).uprawnienia).toEqual({ 'klient1_sklep|klient1_app': { zestaw: 'full', status: 'COMPLETED', nieudana: 'ro' } });
    s.prisma.nodeTask.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([z('ro', 'COMPLETED'), z('rw', 'FAILED')] as never);
    expect((await s.svc.status('s1', 'u1')).uprawnienia).toEqual({ 'klient1_sklep|klient1_app': { zestaw: 'ro', status: 'COMPLETED' } });
  });

  it('D-17: przeliczenie rozmiarów bez bazy w zadaniu; parser odrzuca śmieci', async () => {
    const s = stanowisko();
    await s.svc.zlecRozmiary('s1', 'u1');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payload: { mode: 'sizes', db: '', daUser: 'klient1' } }) });
    expect(rozmiaryZLogu('VERRIS_DB_ROZMIAR=klient1_sklep\t33792\t4\nVERRIS_DB_ROZMIAR=a;b\t1\t1\nx')).toEqual([{ baza: 'klient1_sklep', bajty: 33792, tabele: 4 }]);
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
      '[db-transfer] BŁĄD: import przerwany – baza mogła zostać zmieniona częściowo. Przywrócisz ją importem pliku ~/verris-bazy/x.sql.gz',
    ].join('\n');
    expect(wynikZLogu(log)).toBe('verris-bazy/klient1_sklep-przed-importem-20260924-174753-655a.sql.gz');
    expect(wynikZLogu('VERRIS_WYNIK_PLIK=/etc/shadow')).toBeNull();
    expect(bladDlaKlienta(log, 'rc=1')).toMatch(/^import przerwany .* Powód: ERROR 1044 .*obcy_baza/);
    expect(bladDlaKlienta('[db-transfer] BŁĄD: brak pliku /home/klient1/verris-bazy/a.sql', null)).toBe('brak pliku ~/verris-bazy/a.sql');
  });
  describe('paczka 129 – wgranie pliku do importu z zakładki baz', () => {
    const SQL = Buffer.from('CREATE TABLE t (id int);\n');
    const GZ = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x00]);

    it('wgrywa .sql do ~/verris-bazy jako użytkownik konta, wpis w audycie, zwraca stan z listą plików', async () => {
      const s = stanowisko({ katalog: [{ name: 'inny.sql' }] });
      const r = await s.svc.wgrajPlik('s1', 'u1', 'sklep.sql', SQL);
      expect(s.da.getClientForHostingAccount).toHaveBeenCalledWith('a1', 'u1');
      expect(s.klient.makeDir).not.toHaveBeenCalled();
      expect(s.klient.uploadFile).toHaveBeenCalledWith('/verris-bazy', 'sklep.sql', SQL);
      expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({
        action: 'HOSTING_FILE_UPLOADED',
        details: expect.objectContaining({ path: '/verris-bazy/sklep.sql', bytes: SQL.length }),
      }));
      expect(r).toMatchObject({ katalog: 'verris-bazy', pliki: [] });
    });

    it('brak katalogu (przed pierwszym eksportem) → najpierw tworzy verris-bazy w katalogu domowym', async () => {
      const s = stanowisko({ katalog: null });
      await s.svc.wgrajPlik('s1', 'u1', 'kopia.sql.gz', GZ);
      expect(s.klient.makeDir).toHaveBeenCalledWith('/', 'verris-bazy');
      expect(s.klient.uploadFile).toHaveBeenCalledWith('/verris-bazy', 'kopia.sql.gz', GZ);
    });

    it('plik o tej samej nazwie (np. kopia sprzed importu) → 409, bez nadpisania', async () => {
      const s = stanowisko({ katalog: [{ name: 'klient1_sklep-przed-importem.sql.gz' }] });
      await expect(s.svc.wgrajPlik('s1', 'u1', 'klient1_sklep-przed-importem.sql.gz', GZ)).rejects.toBeInstanceOf(ConflictException);
      expect(s.klient.uploadFile).not.toHaveBeenCalled();
    });

    it.each([
      ['../../etc/passwd.sql', SQL],
      ['strona.php', SQL],
      ['zrzut.sql.zip', SQL],
      ['a"b.sql', SQL],
      ['pusty.sql', Buffer.alloc(0)],
      ['udawany.sql.gz', SQL],
    ])('zły plik (%s) → 400 przed serwerem', async (nazwa, dane) => {
      const s = stanowisko();
      await expect(s.svc.wgrajPlik('s1', 'u1', nazwa, dane)).rejects.toBeInstanceOf(BadRequestException);
      expect(s.da.getClientForHostingAccount).not.toHaveBeenCalled();
      expect(s.audit.record).not.toHaveBeenCalled();
    });

    it('ponad 25 MB → 413 z podpowiedzią FTP; konto zawieszone → 400', async () => {
      const s = stanowisko();
      await expect(s.svc.wgrajPlik('s1', 'u1', 'duzy.sql', Buffer.alloc(MAX_PLIKU_BAZY + 1, 0x41))).rejects.toBeInstanceOf(PayloadTooLargeException);
      await expect(stanowisko({ status: 'SUSPENDED' }).svc.wgrajPlik('s1', 'u1', 'a.sql', SQL)).rejects.toThrow('nie jest aktywne');
      expect(s.klient.uploadFile).not.toHaveBeenCalled();
    });
  });
});
