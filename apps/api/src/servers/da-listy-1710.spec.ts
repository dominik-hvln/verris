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
