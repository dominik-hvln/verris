import { HttpException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { FilesService } from './files.service.js';

/**
 * Audyt 13.10 (files.service.ts:download:buffered-without-aggregate-limit) — pobranie i odczyt pliku buforowały
 * całość w pamięci wspólnego API: przy nieznanym rozmiarze (listing bez dopasowania) bez kontroli, limit liczony dopiero
 * po pełnym zbuforowaniu, bez limitu równoczesnych odczytów na konto.
 */
function stanowisko(o: { wpis?: string | null; pobierz?: () => Promise<Buffer> } = {}) {
  const klient = {
    listDir: vi.fn(async () => (o.wpis === null ? [] : [{ name: o.wpis ?? 'plik.txt', type: 'file', sizeBytes: 10, modified: null }])),
    downloadFile: vi.fn(o.pobierz ?? (async () => Buffer.from('abc'))),
  };
  const account = { id: 'a1', status: 'ACTIVE', serverId: 'n1', daUsername: 'klient1' };
  const prisma = { subscription: { findFirst: vi.fn(async () => ({ id: 's1', account })) } };
  const da = { getClientForServer: vi.fn(async () => ({ asUser: vi.fn(() => klient) })) };
  const svc = new FilesService(prisma as never, da as never, { record: vi.fn() } as never);
  return { svc, klient };
}

describe('Menedżer plików — pobieranie bez nieograniczonego bufora', () => {
  it('nieznany rozmiar (brak w listingu) → 404 bez pobierania (download i read)', async () => {
    const s = stanowisko({ wpis: null });
    await expect(s.svc.download('s1', 'u1', '/public_html/plik.txt')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.svc.read('s1', 'u1', '/public_html/plik.txt')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.klient.downloadFile).not.toHaveBeenCalled();
  });

  it('limit bajtów przekazany do odbioru (axios maxContentLength); przekroczenie w trakcie → 413', async () => {
    const s = stanowisko({ pobierz: async () => { throw new Error('maxContentLength size of 100000000 exceeded'); } });
    await expect(s.svc.download('s1', 'u1', '/public_html/plik.txt')).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(s.klient.downloadFile).toHaveBeenCalledWith('/public_html/plik.txt', 100_000_000);
  });

  it('trzeci równoczesny odczyt tego samego konta → 429 bez wołania serwera', async () => {
    let zwolnij: () => void = () => undefined;
    const czekaj = new Promise<void>((r) => (zwolnij = r));
    const s = stanowisko({ pobierz: async () => { await czekaj; return Buffer.from('abc'); } });
    const a = s.svc.download('s1', 'u1', '/public_html/plik.txt');
    const b = s.svc.download('s1', 'u1', '/public_html/plik.txt');
    await new Promise((r) => setTimeout(r, 10));
    const c = await s.svc.download('s1', 'u1', '/public_html/plik.txt').catch((e: unknown) => e);
    expect(c).toBeInstanceOf(HttpException);
    expect((c as HttpException).getStatus()).toBe(429);
    expect(s.klient.downloadFile).toHaveBeenCalledTimes(2);
    zwolnij();
    await Promise.all([a, b]);
    await expect(s.svc.download('s1', 'u1', '/public_html/plik.txt')).resolves.toMatchObject({ filename: 'plik.txt' });
  });
});
