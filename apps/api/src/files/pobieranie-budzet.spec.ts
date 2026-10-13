import { HttpException } from '@nestjs/common';
import { FilesService, MAX_BAJTOW_ODCZYTOW } from './files.service.js';

/** Zaległość z audytu (13.10): limit 2 odczytów na konto nie ograniczał sumy bajtów w pamięci API dla wielu kont. */
describe('Menedżer plików — globalny budżet bajtów odczytów', () => {
  it('suma rozmiarów w toku ponad budżet → 503 bez wołania serwera; po zwolnieniu znów działa', async () => {
    const ROZMIAR = 90_000_000;
    let zwolnij: () => void = () => undefined;
    const czekaj = new Promise<void>((r) => (zwolnij = r));
    const klient = {
      listDir: vi.fn(async () => [{ name: 'duzy.zip', type: 'file', sizeBytes: ROZMIAR, modified: null }]),
      downloadFile: vi.fn(async () => {
        await czekaj;
        return Buffer.alloc(1);
      }),
    };
    const prisma = {
      subscription: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, account: { id: `konto-${where.id}`, status: 'ACTIVE', serverId: 'n1', daUsername: 'k' } })),
      },
    };
    const da = { getClientForServer: vi.fn(async () => ({ asUser: vi.fn(() => klient) })) };
    const svc = new FilesService(prisma as never, da as never, { record: vi.fn() } as never);

    const ile = Math.floor(MAX_BAJTOW_ODCZYTOW / ROZMIAR);
    const wToku = Array.from({ length: ile }, (_, i) => svc.download(`s${i}`, 'u1', '/duzy.zip'));
    await new Promise((r) => setTimeout(r, 10));
    const nadmiar = await svc.download('s-ostatni', 'u1', '/duzy.zip').catch((e: unknown) => e);
    expect(nadmiar).toBeInstanceOf(HttpException);
    expect((nadmiar as HttpException).getStatus()).toBe(503);
    expect(klient.downloadFile).toHaveBeenCalledTimes(ile);
    zwolnij();
    await Promise.all(wToku);
    await expect(svc.download('s-ostatni', 'u1', '/duzy.zip')).resolves.toMatchObject({ filename: 'duzy.zip' });
  });
});
