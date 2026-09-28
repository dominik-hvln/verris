import { DirectAdminClient } from '@verris/directadmin-sdk';

/**
 * DA 1.710 (t1, test D3 29.09) zwraca listy jako `list[]=a` (bez json) albo gołą tablicę (json=yes).
 * Prawdziwy DirectAdminClient z podmienionym axios — sprawdzamy, że panel widzi to, co jest na serwerze.
 */
function klient(odp: (path: string, params: Record<string, string>) => unknown) {
  const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, string> }) => ({ data: odp(path, cfg?.params ?? {}) }));
  Object.assign(k, { client: { get, post: vi.fn() } });
  return k;
}

describe('listy DA 1.710', () => {
  it('bazy MySQL: `list[]=` (pierwsza próba, bez json) → nazwy baz, nie pusta lista', async () => {
    const k = klient(() => 'list%5B%5D=klient1_wp8664&list%5B%5D=klient1_sklep');
    await expect(k.listMysqlDatabases()).resolves.toEqual(['klient1_wp8664', 'klient1_sklep']);
  });

  it('bazy MySQL: goła tablica JSON', async () => {
    await expect(klient(() => ['klient1_wp']).listMysqlDatabases()).resolves.toEqual(['klient1_wp']);
  });

  it('skrzynki: gdy type=quota nic nie da, lista nazw `list[]=` nadal pokazuje skrzynkę', async () => {
    const k = klient((_p, params) => (params.type === 'quota' ? '' : 'list%5B%5D=jan'));
    await expect(k.listEmailAccounts('firma.pl')).resolves.toEqual([{ localPart: 'jan', quotaMb: null }]);
  });
});

describe('menedżer plików DA 1.710', () => {
  it('„Zmodyfikowano” z mtime, nie z date (czas utworzenia)', async () => {
    const k = klient(() => new URLSearchParams({ '/public_html/.htaccess': 'type=file&size=1100&date=1790550175&mtime=1790636575' }).toString());
    await expect(k.listDir('/public_html')).resolves.toEqual([{ name: '.htaccess', type: 'file', sizeBytes: 1100, modified: '1790636575' }]);
  });
});

describe('zaznaczenie w menedżerze plików DA 1.710 — pełne ścieżki', () => {
  const zPosta = () => {
    const post = vi.fn(async (_p: string, _b: string) => ({ data: 'error=0' }));
    const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    Object.assign(k, { client: { get: vi.fn(), post } });
    const pola = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
    return { k, pola };
  };

  it('usuwanie: select0 = /katalog/plik (sama nazwa: DA mówi error=0 i nic nie kasuje)', async () => {
    const { k, pola } = zPosta();
    await k.deleteEntries('/public_html/', ['a.txt', 'b.php']);
    expect(pola()).toMatchObject({ action: 'multiple', button: 'delete', select0: '/public_html/a.txt', select1: '/public_html/b.php' });
  });

  it('katalog domowy „/” nie daje podwójnego ukośnika; chmod i schowek też pełnymi ścieżkami', async () => {
    const { k, pola } = zPosta();
    await k.chmodEntries('/', ['x'], '644');
    expect(pola().select0).toBe('/x');
    await k.transferEntries('/public_html', ['y'], '/tmp', 'copy');
    expect(pola(1)).toMatchObject({ add: 'clipboard', select0: '/public_html/y' });
  });
});
