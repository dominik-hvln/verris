import { BadRequestException, ForbiddenException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { FilesService } from './files.service';

/**
 * Menedżer plików (C-01…C-13): piaskownica ścieżek i nazw oraz własność usługi. Dotąd bez testu,
 * a to jedyna warstwa przed DA, która pilnuje, że klient nie wyjdzie poza swój katalog domowy.
 */
function stanowisko(o: { konto?: Record<string, unknown> | null; brakUslugi?: boolean; rozmiar?: number } = {}) {
  const account = o.konto === undefined ? { id: 'a1', status: 'ACTIVE', serverId: 'n1', daUsername: 'klient1' } : o.konto;
  const klient = {
    listDir: jest.fn(async () => [{ name: 'plik.txt', type: 'file', sizeBytes: o.rozmiar ?? 10, modified: null }]),
    downloadFile: jest.fn(async () => Buffer.from('abc')),
    client: { get: jest.fn(async () => ({ data: 'STRUMIEN' })) },
  };
  const prisma = { subscription: { findFirst: jest.fn(async () => (o.brakUslugi ? null : { id: 's1', account })) } };
  const da = { getClientForServer: jest.fn(async () => ({ asUser: jest.fn(() => klient) })) };
  const svc = new FilesService(prisma as never, da as never, { record: jest.fn() } as never);
  return { svc, klient, prisma };
}

describe('FilesService — piaskownica', () => {
  it.each([
    ['/', '/'],
    ['public_html/./a//b/', '/public_html/a/b'],
    ['/public_html/a/../b', '/public_html/b'],
  ])('normalizuje %s → %s (lista w DA pod tą ścieżką)', async (wejscie, oczekiwana) => {
    const s = stanowisko();
    await expect(s.svc.list('s1', 'u1', wejscie)).resolves.toMatchObject({ path: oczekiwana });
    expect(s.klient.listDir).toHaveBeenCalledWith(oczekiwana);
  });

  it.each([['../etc/passwd'], ['/public_html/../../root'], ['a/../../b']])('wyjście poza katalog domowy %s → 403 bez DA', async (p) => {
    const s = stanowisko();
    await expect(s.svc.list('s1', 'u1', p)).rejects.toBeInstanceOf(ForbiddenException);
    expect(s.klient.listDir).not.toHaveBeenCalled();
  });

  it('bajt zerowy w ścieżce → 400', async () => {
    const s = stanowisko();
    await expect(s.svc.list('s1', 'u1', 'public_html/a\0.php')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cudza usługa → 404; konto nieaktywne → 400 (bez połączenia z DA)', async () => {
    const obca = stanowisko({ brakUslugi: true });
    await expect(obca.svc.list('s1', 'u1', '/')).rejects.toBeInstanceOf(NotFoundException);
    const zawieszone = stanowisko({ konto: { id: 'a1', status: 'SUSPENDED', serverId: 'n1', daUsername: 'k' } });
    await expect(zawieszone.svc.list('s1', 'u1', '/')).rejects.toBeInstanceOf(BadRequestException);
    expect(obca.prisma.subscription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1', userId: 'u1' } }));
  });

  it('pobranie: katalog domowy jako plik → 400; plik ponad limit → 413 przed wczytaniem do pamięci', async () => {
    const s = stanowisko();
    await expect(s.svc.download('s1', 'u1', '/')).rejects.toBeInstanceOf(BadRequestException);
    const duzy = stanowisko({ rozmiar: 200 * 1024 * 1024 });
    await expect(duzy.svc.download('s1', 'u1', '/plik.txt')).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(duzy.klient.downloadFile).not.toHaveBeenCalled();
    await expect(s.svc.download('s1', 'u1', '/plik.txt')).resolves.toMatchObject({ filename: 'plik.txt' });
  });
});

describe('FilesService.downloadStream (H-13)', () => {
  it('strumień z DA bez limitu 100 MB, z rozmiarem i wpisem w dzienniku', async () => {
    const s = stanowisko({ rozmiar: 3 * 1024 * 1024 * 1024 });
    const r = await s.svc.downloadStream('s1', 'u1', '/plik.txt');
    expect(r).toEqual({ filename: 'plik.txt', stream: 'STRUMIEN', size: 3 * 1024 * 1024 * 1024 });
    expect(s.klient.client.get).toHaveBeenCalledWith('/CMD_FILE_MANAGER/plik.txt', expect.objectContaining({ responseType: 'stream' }));
    expect(s.klient.downloadFile).not.toHaveBeenCalled();
  });
  it('brak pliku → 404; wyjście poza katalog → 403; katalog domowy → 400 (bez pobierania)', async () => {
    const s = stanowisko();
    await expect(s.svc.downloadStream('s1', 'u1', '/nie-ma.tar.gz')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.svc.downloadStream('s1', 'u1', '../../etc/shadow')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(s.svc.downloadStream('s1', 'u1', '/')).rejects.toBeInstanceOf(BadRequestException);
    expect(s.klient.client.get).not.toHaveBeenCalled();
  });
});
