import { BadRequestException } from '@nestjs/common';
import { FileRestoreService, katalogZLogu, sprawdzSciezke, wpisyZLogu } from './file-restore.service.js';

/**
 * H-10 / H-11 — strona API. Skrypt węzła sprawdzony lokalnie (tar.gz, plik ze spacją, dowiązanie,
 * brak ścieżki, „..”): pliki trafiają do nowego katalogu i nic nie jest nadpisywane.
 */
function stanowisko() {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: vi.fn(async () => null),
      findMany: vi.fn(async () => []),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  return { svc: new FileRestoreService(prisma as never, audit as never), prisma, audit };
}

describe('FileRestoreService', () => {
  it('odtworzenie: zadanie FILE_RESTORE, login z konta, audyt', async () => {
    const s = stanowisko();
    await s.svc.zlecOdtworzenie('s1', 'u1', 'user.admin.klient1.tar.gz', './domains/firma.pl/public_html/wp-config.php');
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      kind: 'FILE_RESTORE', payload: { mode: 'extract', archive: 'user.admin.klient1.tar.gz', path: 'domains/firma.pl/public_html/wp-config.php', daUser: 'klient1' },
    }) });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_FILE_RESTORE_QUEUED' }));
  });

  it.each([['../etc/shadow.tar.gz', 'a'], ['x.tar.gz', '/etc/passwd'], ['x.tar.gz', 'domains/../../etc'], ['x.tar.gz', 'a\nb'], ['x.zip', 'a']])(
    'odrzuca archiwum %j / ścieżkę %j bez zadania',
    async (archive, path) => {
      const s = stanowisko();
      await expect(s.svc.zlecOdtworzenie('s1', 'u1', archive, path)).rejects.toBeInstanceOf(BadRequestException);
      expect(s.prisma.nodeTask.create).not.toHaveBeenCalled();
    },
  );

  it('lista bez prefiksu jest dozwolona; odtworzenie bez ścieżki — nie', () => {
    expect(sprawdzSciezke('', false)).toBe('');
    expect(() => sprawdzSciezke(' ', true)).toThrow('Wskaż');
    expect(sprawdzSciezke('domains/a..b/plik', true)).toBe('domains/a..b/plik');
  });

  it('parsowanie logu węzła', () => {
    const log = 'VERRIS_WPIS d|0|domains/firma.pl\nVERRIS_WPIS f|9|domains/firma.pl/moj plik.txt\nśmieci\nVERRIS_OBCIETE 2000\nVERRIS_WYNIK_KATALOG=verris-odtworzone/20260924-175930-057b';
    expect(wpisyZLogu(log)).toEqual({ wpisy: [{ typ: 'd', rozmiar: 0, sciezka: 'domains/firma.pl' }, { typ: 'f', rozmiar: 9, sciezka: 'domains/firma.pl/moj plik.txt' }], obciete: true });
    expect(katalogZLogu(log)).toBe('verris-odtworzone/20260924-175930-057b');
    expect(katalogZLogu('VERRIS_WYNIK_KATALOG=/etc')).toBeNull();
  });
});
