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

describe('menedżer plików DA 1.710 — zmiana nazwy', () => {
  it('old = sama nazwa (pełna ścieżka dawała błąd na t1)', async () => {
    const post = vi.fn(async (_p: string, _b: string) => ({ data: 'error=0' }));
    const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    Object.assign(k, { client: { get: vi.fn(), post } });
    await k.renameEntry('/verris-fm-test', 'a.txt', 'c.txt');
    expect(Object.fromEntries(new URLSearchParams(String(post.mock.calls[0]?.[1])))).toMatchObject({ action: 'rename', path: '/verris-fm-test', old: 'a.txt', filename: 'c.txt' });
  });
});

describe('webmail jednym kliknięciem (CMD_WEBMAIL_LOGIN)', () => {
  const zOdpowiedzia = (html: string) => {
    const post = vi.fn(async () => ({ data: html }));
    const k = new DirectAdminClient({ host: '2.28.204.249', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    Object.assign(k, { client: { get: vi.fn(), post } });
    return { k, post };
  };

  it('formularz DA → adres Roundcube i token; zapytanie z email skrzynki', async () => {
    const { k, post } = zOdpowiedzia('<html><body><form method="post" action="https://t1.verris.pl/roundcube/direct_login/index.php"><input type="hidden" name="token" value="abc123"></form></body></html>');
    await expect(k.createWebmailLogin('test@d3.hvln.pl')).resolves.toEqual({ action: 'https://t1.verris.pl/roundcube/direct_login/index.php', token: 'abc123' });
    expect(String((post.mock.calls[0] as unknown[])[1])).toBe('email=test%40d3.hvln.pl');
  });

  it('prawdziwa odpowiedź DA 1.710 (atrybuty w apostrofach) → adres i token', async () => {
    const { k } = zOdpowiedzia("<html><body onload='document.autologin.submit()'><form action='https://t1.verris.pl/roundcube/direct_login/index.php' name='autologin' method='POST'><input type='hidden' name='token' value='abc123'/></form></body></html>");
    await expect(k.createWebmailLogin('test@d3.hvln.pl')).resolves.toEqual({ action: 'https://t1.verris.pl/roundcube/direct_login/index.php', token: 'abc123' });
  });

  it.each([
    ['obcy adres', '<form action="https://zly.example/login"><input name="token" value="x"></form>'],
    ['http zamiast https', '<form action="http://t1.verris.pl/roundcube/direct_login/"><input name="token" value="x"></form>'],
    ['brak tokenu', '<form action="https://t1.verris.pl/roundcube/direct_login/"></form>'],
    ['strona 404 DA', '<html>Nie znaleziono</html>'],
  ])('%s → błąd, klient nie dostaje adresu', async (_n, html) => {
    await expect(zOdpowiedzia(html).k.createWebmailLogin('test@d3.hvln.pl')).rejects.toThrow();
  });
});

describe('menedżer plików DA 1.710 — odpowiedzi', () => {
  const zPost = (status: number, data: string) => {
    const post = vi.fn(async (_p: string, _b: string, _c?: unknown) => ({ status, data }));
    const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    Object.assign(k, { client: { get: vi.fn(), post } });
    return { k, post };
  };

  it('operacje idą do CMD_API_FILE_MANAGER (stara CMD_FILE_MANAGER dawała 500 po udanym pakowaniu)', async () => {
    const { k, post } = zPost(200, 'error=0&text=OK');
    await k.compressEntries('/', ['katalog'], 'archiwum');
    expect(post.mock.calls.map((c) => c[0])).toEqual(['/CMD_API_FILE_MANAGER', '/CMD_API_FILE_MANAGER', '/CMD_API_FILE_MANAGER']);
  });

  it('HTTP 500 z error=1 → komunikat DA z details, nie „Wewnętrzny błąd serwera”', async () => {
    const { k } = zPost(500, 'error=1&text=Nie%20mo%C5%BCna&details=no%20such%20file%20or%20directory');
    await expect(k.renameEntry('/x', 'a', 'b')).rejects.toThrow('no such file or directory');
  });
});

describe('użytkownicy bazy — CMD_API_DB_USER wg dokumentacji DA (name = baza)', () => {
  const zPosta = (odpowiedz = 'error=0&text=OK') => {
    const post = vi.fn(async (_p: string, _b: string) => ({ data: odpowiedz }));
    const get = vi.fn(async (_p: string, _c?: unknown) => ({ data: 'list%5B%5D=klient1_wp&list%5B%5D=klient1_test' }));
    const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    Object.assign(k, { client: { get, post } });
    const pola = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
    return { k, post, get, pola };
  };

  it('lista: GET name=<baza>; utworzenie: name=<baza>, user=<krótki> (retest D3 29.09: name=<użytkownik>)', async () => {
    const s = zPosta();
    await expect(s.k.listDbUsers('klient1_wp')).resolves.toEqual(['klient1_test', 'klient1_wp']);
    expect(s.get).toHaveBeenCalledWith('/CMD_API_DB_USER', { params: { name: 'klient1_wp' } });
    await expect(s.k.createDbUser('klient1_wp', 'test', 'Haslo-testowe-1')).resolves.toEqual({ username: 'klient1_test' });
    expect(s.pola()).toEqual({ action: 'create', name: 'klient1_wp', user: 'test', passwd: 'Haslo-testowe-1', passwd2: 'Haslo-testowe-1' });
  });

  it('zmiana hasła i usunięcie z name=<baza>; błąd DA nie jest zamieniany na sukces', async () => {
    const s = zPosta();
    await s.k.setDbUserPassword('klient1_wp', 'klient1_test', 'Haslo-testowe-2');
    expect(s.pola(0)).toEqual({ action: 'modify', name: 'klient1_wp', user: 'klient1_test', passwd: 'Haslo-testowe-2', passwd2: 'Haslo-testowe-2' });
    await s.k.deleteDbUser('klient1_wp', 'klient1_test');
    expect(s.pola(1)).toEqual({ action: 'delete', name: 'klient1_wp', select0: 'klient1_test' });
    const bl = zPosta('error=1&text=Database+does+not+exist');
    await expect(bl.k.createDbUser('klient1_wp', 'x', 'Haslo-testowe-3')).rejects.toThrow('Database does not exist');
    expect(bl.post).toHaveBeenCalledTimes(1);
  });
});

describe('CL-01: odpowiedź bez error=0 to nie sukces (Legacy API: error=1|0)', () => {
  const zPosta = (odpowiedz: unknown) => {
    const post = vi.fn(async (_p: string, _b: string) => ({ data: odpowiedz }));
    const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
    Object.assign(k, { client: { get: vi.fn(), post } });
    return { k, post };
  };

  it.each([
    ['strona HTML', '<html><body>Unknown command</body></html>'],
    ['pusta odpowiedź', ''],
    ['treść bez pola error', 'text=cokolwiek'],
  ])('użytkownik bazy: %s → wyjątek, a nie „dodano”', async (_n, odpowiedz) => {
    const { k, post } = zPosta(odpowiedz);
    await expect(k.createDbUser('klient1_wp', 'test', 'Haslo-testowe-1')).rejects.toThrow();
    await expect(k.setDbUserPassword('klient1_wp', 'klient1_test', 'Haslo-testowe-2')).rejects.toThrow();
    await expect(k.deleteDbUser('klient1_wp', 'klient1_test')).rejects.toThrow();
    expect(post).toHaveBeenCalledTimes(3);
  });
});

describe('CL-01: Admin Settings — bez odczytu nie ma zapisu', () => {
  const zAdminem = (get: (p: string) => unknown, postBody: unknown = 'error=0&text=Saved') => {
    const post = vi.fn(async (_p: string, _b: string) => ({ data: postBody }));
    const k = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'admin', loginKey: 'x', secure: true });
    Object.assign(k, { client: { get: vi.fn(async (p: string) => { const v = get(p); if (v instanceof Error) throw v; return { data: v }; }), post } });
    return { k, post };
  };

  it('oba odczyty padają → wyjątek i ŻADNEGO action=save z samymi domyślnymi polami', async () => {
    const { k, post } = zAdminem(() => new Error('Request failed with status code 500'));
    await expect(k.setAdminDefaultNameservers('ns1.verris.pl', 'ns2.verris.pl')).rejects.toThrow('500');
    expect(post).not.toHaveBeenCalled();
  });

  it('odczyt OK → zapis z bieżącymi polami i nowymi NS', async () => {
    const { k, post } = zAdminem(() => ({ server_settings: { timeout: '60', ns1: 'stary1', ns2: 'stary2' } }));
    await k.setAdminDefaultNameservers('ns1.verris.pl', 'ns2.verris.pl');
    const pola = Object.fromEntries(new URLSearchParams(String(post.mock.calls[0]?.[1])));
    expect(pola).toMatchObject({ action: 'save', timeout: '60', ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl' });
  });

  it('zapis odpowiada stroną HTML → wyjątek, nie „zapisano”', async () => {
    const { k } = zAdminem(() => ({ ns1: 'a', ns2: 'b' }), '<html><form action="/CMD_LOGIN"></form></html>');
    await expect(k.setAdminDefaultNameservers('ns1.verris.pl', 'ns2.verris.pl')).rejects.toThrow('HTML');
  });
});
