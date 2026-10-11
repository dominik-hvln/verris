import { BadRequestException, ForbiddenException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { FilesService } from './files.service.js';

/**
 * Menedżer plików (C-01…C-13): piaskownica ścieżek i nazw oraz własność usługi. Dotąd bez testu,
 * a to jedyna warstwa przed DA, która pilnuje, że klient nie wyjdzie poza swój katalog domowy.
 */
function stanowisko(o: { konto?: Record<string, unknown> | null; brakUslugi?: boolean; rozmiar?: number; wpisy?: string[] } = {}) {
  const account = o.konto === undefined ? { id: 'a1', status: 'ACTIVE', serverId: 'n1', daUsername: 'klient1' } : o.konto;
  const klient = {
    listDir: vi.fn(async () =>
      (o.wpisy ?? ['plik.txt']).map((name) => ({ name, type: 'file', sizeBytes: o.rozmiar ?? 10, modified: null })),
    ),
    downloadFile: vi.fn(async () => Buffer.from('abc')),
    client: { get: vi.fn(async () => ({ data: 'STRUMIEN' })) },
    writeFile: vi.fn(async () => undefined),
    makeDir: vi.fn(async () => undefined),
    renameEntry: vi.fn(async () => undefined),
    deleteEntries: vi.fn(async () => undefined),
    uploadFile: vi.fn(async () => undefined),
    transferEntries: vi.fn(async () => undefined),
    compressEntries: vi.fn(async () => undefined),
    extractArchive: vi.fn(async () => undefined),
    chmodEntries: vi.fn(async () => undefined),
  };
  const prisma = { subscription: { findFirst: vi.fn(async () => (o.brakUslugi ? null : { id: 's1', account })) } };
  const da = { getClientForServer: vi.fn(async () => ({ asUser: vi.fn(() => klient) })) };
  const svc = new FilesService(prisma as never, da as never, { record: vi.fn() } as never);
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

describe('FilesService — wpisy systemowe katalogu domowego (biała etykieta, prod d3 12.10)', () => {
  const SYSTEMOWE = ['.cagefs', '.imunify_patch_id', '.myimunify_id'];

  it('katalog domowy: lista bez wpisów systemowych; public_html: plik o tej nazwie widoczny', async () => {
    const dom = stanowisko({ wpisy: ['.bash_profile', ...SYSTEMOWE, 'domains', 'public_html'] });
    const r = await dom.svc.list('s1', 'u1', '/');
    expect(r.entries.map((e) => e.name)).toEqual(['.bash_profile', 'domains', 'public_html']);
    const strona = stanowisko({ wpisy: ['.cagefs', 'index.php'] });
    const w = await strona.svc.list('s1', 'u1', '/domains/x.pl/public_html');
    expect(w.entries.map((e) => e.name)).toEqual(['.cagefs', 'index.php']);
  });

  it.each([
    ['lista wnętrza', (s: FilesService) => s.list('s1', 'u1', '/.cagefs/tmp')],
    ['odczyt', (s: FilesService) => s.read('s1', 'u1', '/.myimunify_id')],
    ['pobranie', (s: FilesService) => s.download('s1', 'u1', '.imunify_patch_id')],
    ['pobranie strumieniem', (s: FilesService) => s.downloadStream('s1', 'u1', '/public_html/../.cagefs/tmp/sess_1')],
    ['zapis', (s: FilesService) => s.write('s1', 'u1', '/', '.myimunify_id', 'x')],
    ['zapis we wnętrzu', (s: FilesService) => s.write('s1', 'u1', '/.cagefs', 'a.php', 'x')],
    ['nowy katalog', (s: FilesService) => s.mkdir('s1', 'u1', '/', '.cagefs')],
    ['zmiana nazwy', (s: FilesService) => s.rename('s1', 'u1', '/', '.cagefs', 'moje')],
    ['zmiana nazwy na systemową', (s: FilesService) => s.rename('s1', 'u1', '/', 'moje', '.cagefs')],
    ['usunięcie', (s: FilesService) => s.remove('s1', 'u1', '/', ['stary.zip', '.cagefs'])],
    ['wgranie', (s: FilesService) => s.upload('s1', 'u1', '/', '.imunify_patch_id', Buffer.from('x'))],
    ['kopiowanie', (s: FilesService) => s.transfer('s1', 'u1', '/', ['.cagefs'], '/public_html', 'copy')],
    ['przeniesienie do wnętrza', (s: FilesService) => s.transfer('s1', 'u1', '/public_html', ['a.php'], '/.cagefs/tmp', 'move')],
    ['spakowanie', (s: FilesService) => s.compress('s1', 'u1', '/', ['.cagefs'], 'kopia')],
    ['rozpakowanie do wnętrza', (s: FilesService) => s.extract('s1', 'u1', '/a.zip', '/.cagefs')],
    ['uprawnienia', (s: FilesService) => s.chmod('s1', 'u1', '/', ['.cagefs'], '777')],
  ])('%s → 403 z polskim komunikatem, bez wywołania serwera plików', async (_opis, op) => {
    const s = stanowisko();
    const blad = await op(s.svc).catch((e: unknown) => e);
    expect(blad).toBeInstanceOf(ForbiddenException);
    expect((blad as Error).message).toBe('Ten element jest zarządzany przez serwer — nie można go otwierać ani zmieniać.');
    for (const f of Object.values(s.klient)) if (typeof f === 'function') expect(f).not.toHaveBeenCalled();
    expect(s.klient.client.get).not.toHaveBeenCalled();
  });

  it('te same operacje na pliku o tej nazwie w public_html przechodzą', async () => {
    const s = stanowisko();
    await s.svc.remove('s1', 'u1', '/domains/x.pl/public_html', ['.cagefs']);
    expect(s.klient.deleteEntries).toHaveBeenCalledWith('/domains/x.pl/public_html', ['.cagefs']);
    await s.svc.chmod('s1', 'u1', '/public_html', ['.myimunify_id'], '644');
    expect(s.klient.chmodEntries).toHaveBeenCalledWith('/public_html', ['.myimunify_id'], '644');
  });
});
