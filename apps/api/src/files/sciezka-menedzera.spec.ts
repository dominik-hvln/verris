import { DirectAdminClient } from '@verris/directadmin-sdk';
import { FilesService } from './files.service.js';

/**
 * Audyt 13.10 (do potwierdzenia #11, libs/directadmin-sdk/src/client.ts:CMD_FILE_MANAGER-unencoded-path-dot-segment-escape):
 * ścieżka menedżera plików była doklejana do adresu `/CMD_FILE_MANAGER…` bez kodowania. Express dekoduje parametr
 * raz, więc klient wysyłał `%252e%252e`, do DA szło `/CMD_FILE_MANAGER/%2e%2e/…`, a URL zwijał to do `..` — GET
 * trafiał w dowolną komendę DA w sesji konta (a „?” dokładało jej parametry). Teraz każdy segment jest kodowany:
 * po rozwiązaniu adresu ścieżka zostaje pod /CMD_FILE_MANAGER/, a znaki specjalne są częścią nazwy pliku.
 */
const BAZA = 'https://da.test:2222';
const sciezkaPoRozwiazaniu = (adres: string) => new URL(adres, BAZA);

function klientDa() {
  const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  const get = vi.fn(async () => ({ data: 'tresc' }));
  Object.assign(k, { client: { get } });
  return { k, get };
}

describe('menedżer plików — ścieżka w adresie CMD_FILE_MANAGER', () => {
  it.each([
    ['/%2e%2e/CMD_API_SHOW_USER_CONFIG'],
    ['/%2E%2E/CMD_API_SHOW_USER_CONFIG?json=yes'],
    ['/public_html/%2e%2e/%2e%2e/CMD_API_POP?action=create&domain=x.pl'],
    ['/a#b'],
  ])('odczyt %s zostaje plikiem pod /CMD_FILE_MANAGER/ (bez query i bez wyjścia z katalogu)', async (sciezka) => {
    const { k, get } = klientDa();
    await k.readFile(sciezka);
    await k.downloadFile(sciezka);
    for (const [adres] of get.mock.calls as unknown as [string][]) {
      const u = sciezkaPoRozwiazaniu(adres);
      expect(u.pathname.startsWith('/CMD_FILE_MANAGER/')).toBe(true);
      expect(u.search).toBe('');
      expect(u.hash).toBe('');
    }
  });

  it('zwykłe nazwy bez zmian: spacje i polskie znaki jak w adresie z URL', async () => {
    const { k, get } = klientDa();
    await k.readFile('/public_html/zdjęcie z wakacji.txt');
    const [adres] = get.mock.calls[0] as unknown as [string];
    expect(sciezkaPoRozwiazaniu(adres).pathname).toBe(
      sciezkaPoRozwiazaniu('/CMD_FILE_MANAGER/public_html/zdjęcie z wakacji.txt').pathname,
    );
  });

  it('dosłowne „..” w SDK → odmowa bez żądania', async () => {
    const { k, get } = klientDa();
    await expect(k.readFile('/public_html/../../etc/passwd')).rejects.toThrow('Nieprawidłowa ścieżka');
    expect(get).not.toHaveBeenCalled();
  });

  it('pobranie strumieniem (FilesService.downloadStream) też koduje ścieżkę', async () => {
    const get = vi.fn(async () => ({ data: 'STRUMIEN' }));
    const klient = {
      listDir: vi.fn(async () => [{ name: 'CMD_API_SHOW_USER_CONFIG', type: 'file', sizeBytes: 10, modified: null }]),
      client: { get },
    };
    const prisma = { subscription: { findFirst: vi.fn(async () => ({ id: 's1', account: { id: 'a1', status: 'ACTIVE', serverId: 'n1', daUsername: 'klient1' } })) } };
    const da = { getClientForServer: vi.fn(async () => ({ asUser: vi.fn(() => klient) })) };
    const svc = new FilesService(prisma as never, da as never, { record: vi.fn() } as never);
    await svc.downloadStream('s1', 'u1', '/%2e%2e/CMD_API_SHOW_USER_CONFIG');
    const [adres] = get.mock.calls[0] as unknown as [string];
    expect(sciezkaPoRozwiazaniu(adres).pathname).toBe('/CMD_FILE_MANAGER/%252e%252e/CMD_API_SHOW_USER_CONFIG');
  });
});
