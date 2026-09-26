import { DirectAdminClient } from '@verris/directadmin-sdk';
import * as bcrypt from 'bcrypt';
import { DirectAdminService } from './directadmin.service.js';

/**
 * X-09 — dotąd nietestowane ścieżki DirectAdminService: ochrona katalogu hasłem, usunięcie aliasu
 * domeny, odczyt catch-all i antyspamu, lista skrzynek. Mock na granicy HTTP (axios w prawdziwym
 * DirectAdminClient) + atrapy operacji na plikach. Pilnujemy:
 *  - ścieżka z „..” albo znakami spoza białej listy nie dociera do DA,
 *  - konto zawieszone (SEC-2) nie zapisuje plików,
 *  - .htpasswd ma hash bcrypt w wariancie $2y$ (Apache), a nie jawne hasło,
 *  - awaria DA przy odczycie to komunikat (fetchError), a nie pusty wynik udający „brak”.
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(o: { status?: string; get?: Record<string, unknown>; pliki?: Record<string, string> } = {}) {
  const trasyGet: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    ...o.get,
  };
  const get = vi.fn((path: string, _cfg?: Record<string, unknown>) => {
    const v = trasyGet[path];
    return odp(v ?? '');
  });
  const post = vi.fn((_path: string, _body?: unknown, _cfg?: Record<string, unknown>) => odp('error=0&text=OK'));
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const pliki: Record<string, string> = { ...o.pliki };
  const zapisane: Array<{ dir: string; name: string; tresc: string }> = [];
  vi.spyOn(klient, 'listDir').mockImplementation(async (dir: string) =>
    Object.keys(pliki)
      .filter((p) => p.slice(0, p.lastIndexOf('/')) === dir)
      .map((p) => ({ name: p.slice(p.lastIndexOf('/') + 1), type: 'file' }) as never),
  );
  vi.spyOn(klient, 'downloadFile').mockImplementation(async (p: string) => Buffer.from(pliki['/' + p.replace(/^\/+/, '')] ?? ''));
  vi.spyOn(klient, 'writeFile').mockImplementation(async (dir: string, name: string, tresc: string) => {
    zapisane.push({ dir, name, tresc });
  });
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: { update: vi.fn(async () => account) },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new DirectAdminService(prisma as never, {} as never, {} as never, audit as never);
  vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  return { svc, klient, get, post, audit, zapisane, wyslane };
}

describe('ochrona katalogu hasłem', () => {
  it('zapisuje .htpasswd (bcrypt $2y$) i blok Basic Auth w .htaccess, zostawiając resztę pliku', async () => {
    const s = stanowisko({ pliki: { '/public_html/panel/.htaccess': 'RewriteEngine On' } });
    await s.svc.setHostingDirectoryProtection('s1', 'u1', { dir: '/panel/', user: 'admin', password: 'tajne123', realm: 'Strefa "X"\n' });
    const htpasswd = s.zapisane.find((z) => z.name === '.htpasswd')!;
    expect(htpasswd.dir).toBe('public_html/panel');
    const [login, hash] = htpasswd.tresc.trim().split(':');
    expect(login).toBe('admin');
    expect(hash.startsWith('$2y$')).toBe(true);
    expect(htpasswd.tresc).not.toContain('tajne123');
    expect(await bcrypt.compare('tajne123', hash.replace(/^\$2y\$/, '$2b$'))).toBe(true);
    const htaccess = s.zapisane.find((z) => z.name === '.htaccess')!.tresc;
    expect(htaccess).toContain('RewriteEngine On');
    expect(htaccess).toContain('AuthUserFile "/home/klient1/domains/firma.pl/public_html/panel/.htpasswd"');
    expect(htaccess).toContain('AuthName "Strefa X"'); // cudzysłów i nowa linia wycięte z nazwy obszaru
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ dir: 'panel' }) }));
  });

  it.each([['../../etc'], ['a/../..'], ['katalog;rm'], ['$(id)']])('odrzuca ścieżkę %s bez zapisu', async (dir) => {
    const s = stanowisko();
    await expect(s.svc.setHostingDirectoryProtection('s1', 'u1', { dir, user: 'admin', password: 'tajne123' })).rejects.toThrow('Nieprawidłowa ścieżka');
    await expect(s.svc.removeHostingDirectoryProtection('s1', 'u1', dir)).rejects.toThrow('Nieprawidłowa ścieżka');
    expect(s.zapisane).toEqual([]);
  });

  it('krótkie hasło i dziwny login → 400; konto zawieszone → brak zapisu', async () => {
    const s = stanowisko();
    await expect(s.svc.setHostingDirectoryProtection('s1', 'u1', { dir: 'a', user: 'admin', password: '123' })).rejects.toThrow('6 znaków');
    await expect(s.svc.setHostingDirectoryProtection('s1', 'u1', { dir: 'a', user: 'a b', password: 'tajne123' })).rejects.toThrow('nazwa użytkownika');
    const z = stanowisko({ status: 'SUSPENDED' });
    await expect(z.svc.setHostingDirectoryProtection('s1', 'u1', { dir: 'a', user: 'admin', password: 'tajne123' })).rejects.toThrow();
    await expect(z.svc.removeHostingDirectoryProtection('s1', 'u1', 'a')).rejects.toThrow();
    expect(z.zapisane).toEqual([]);
  });

  it('usunięcie wycina tylko blok Verris z .htaccess', async () => {
    const s = stanowisko();
    await s.svc.setHostingDirectoryProtection('s1', 'u1', { dir: 'panel', user: 'admin', password: 'tajne123' });
    const z = s.zapisane.find((x) => x.name === '.htaccess')!.tresc;
    const po = stanowisko({ pliki: { '/public_html/panel/.htaccess': `Options -Indexes\n${z}` } });
    await po.svc.removeHostingDirectoryProtection('s1', 'u1', 'panel');
    const wynik = po.zapisane.find((x) => x.name === '.htaccess' && x.dir === 'public_html/panel')!.tresc;
    expect(wynik).toContain('Options -Indexes');
    expect(wynik).not.toContain('AuthType Basic');
  });
});

describe('alias domeny — usunięcie', () => {
  it('wysyła do DA delete z domeną główną konta i aliasem małymi literami', async () => {
    const s = stanowisko();
    await s.svc.deleteHostingDomainPointer('s1', 'u1', '  Stara-Firma.PL ');
    expect(s.post.mock.calls[0][0]).toBe('/CMD_API_DOMAIN_POINTER');
    expect(s.wyslane()).toMatchObject({ action: 'delete', domain: 'firma.pl', select0: 'stara-firma.pl' });
  });
  it('pusty alias → 400 bez DA', async () => {
    const s = stanowisko();
    await expect(s.svc.deleteHostingDomainPointer('s1', 'u1', '  ')).rejects.toThrow('Brak aliasu');
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('odczyt catch-all i antyspamu', () => {
  it.each([
    [':fail:', 'fail', ''],
    [':blackhole:', 'blackhole', ''],
    ['biuro@firma.pl', 'address', 'biuro@firma.pl'],
  ])('catch-all %s → tryb %s', async (value, mode, address) => {
    const s = stanowisko({ get: { '/CMD_API_EMAIL_CATCH_ALL': `value=${encodeURIComponent(value)}` } });
    await expect(s.svc.getHostingCatchAll('s1', 'u1')).resolves.toMatchObject({ mode, address, fetchError: null });
  });

  it('antyspam: włączony, próg i znacznik tematu', async () => {
    const s = stanowisko({ get: { '/CMD_API_SPAMASSASSIN': 'is_on=yes&required_score=4.5&subject_tag=%5BSPAM%5D' } });
    await expect(s.svc.getHostingSpamFilter('s1', 'u1')).resolves.toEqual({ isOn: true, requiredScore: '4.5', subjectTag: '[SPAM]', fetchError: null });
  });

  it('awaria DA → fetchError, a nie ciche „wyłączone”', async () => {
    const s = stanowisko({ get: { '/CMD_API_SPAMASSASSIN': new Error('ECONNREFUSED'), '/CMD_API_EMAIL_CATCH_ALL': new Error('ECONNREFUSED') } });
    expect((await s.svc.getHostingSpamFilter('s1', 'u1')).fetchError).toContain('ECONNREFUSED');
    expect((await s.svc.getHostingCatchAll('s1', 'u1')).fetchError).toContain('ECONNREFUSED');
  });
});

describe('lista skrzynek', () => {
  it('adresy z domeną konta i rozmiarem; awaria DA → fetchError', async () => {
    const s = stanowisko();
    vi.spyOn(s.klient, 'listEmailAccounts').mockResolvedValueOnce([{ localPart: 'biuro', quotaMb: 500 }, { localPart: 'jan@firma.pl', quotaMb: 0 }] as never);
    await expect(s.svc.listHostingEmailAccounts('s1', 'u1')).resolves.toEqual({
      rows: [
        { id: 'biuro@firma.pl', email: 'biuro@firma.pl', quotaMb: 500 },
        { id: 'jan@firma.pl', email: 'jan@firma.pl', quotaMb: 0 },
      ],
      fetchError: null,
    });
    vi.spyOn(s.klient, 'listEmailAccounts').mockRejectedValueOnce(new Error('DA 500'));
    await expect(s.svc.listHostingEmailAccounts('s1', 'u1')).resolves.toEqual({ rows: [], fetchError: 'DA 500' });
  });
});

describe('DKIM — włączenie (E-16)', () => {
  it('CMD_API_EMAIL_POP set_dkim z domeną konta + wpis w dzienniku', async () => {
    const s = stanowisko();
    await s.svc.enableHostingDkim('s1', 'u1', 'Firma.pl');
    expect(s.post.mock.calls[0][0]).toBe('/CMD_API_EMAIL_POP');
    expect(s.wyslane()).toMatchObject({ action: 'set_dkim', domain: 'firma.pl', enable: 'yes' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DKIM_ENABLED' }));
  });
  it('cudza domena → 400 bez DA; konto zawieszone → bez mutacji', async () => {
    const s = stanowisko();
    await expect(s.svc.enableHostingDkim('s1', 'u1', 'obca.pl')).rejects.toThrow('nie należy');
    expect(s.post).not.toHaveBeenCalled();
    const z = stanowisko({ status: 'SUSPENDED' });
    await expect(z.svc.enableHostingDkim('s1', 'u1', 'firma.pl')).rejects.toThrow();
    expect(z.post).not.toHaveBeenCalled();
  });
});

describe('dane logowania do panelu hostingu (hosting-da-links)', () => {
  function st() {
    const account = { id: 'a1', status: 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc:tajne', server: { id: 'n1', hostname: 'n1.verris.pl', ipAddress: '203.0.113.5' } };
    const prisma = { subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) } };
    const svc = new DirectAdminService(prisma as never, { decrypt: (v: string) => v.replace('enc:', '') } as never, {} as never, {} as never);
    vi.spyOn(svc as unknown as { syncPrimaryDomainForSubscription: () => Promise<string> }, 'syncPrimaryDomainForSubscription').mockResolvedValue('firma.pl');
    return svc;
  }
  it('właściciel (domyślnie) dostaje login i hasło', async () => {
    await expect(st().getHostingDaLinksForSubscription('s1', 'u1')).resolves.toMatchObject({ daUsername: 'klient1', daPassword: 'tajne', fetchError: null });
  });
  it('subkonto bez uprawnienia do plików: linki tak, hasła i loginu nie (bez komunikatu o błędzie)', async () => {
    const r = await st().getHostingDaLinksForSubscription('s1', 'u1', { pokazHaslo: false });
    expect(r).toMatchObject({ daUsername: null, daPassword: null, fetchError: null });
    expect(r.panelBaseUrl).toBeTruthy();
  });
});
