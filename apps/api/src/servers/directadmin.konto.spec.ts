import { BadRequestException } from '@nestjs/common';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service';

/**
 * Zasoby konta w DirectAdminService: bazy MySQL i ich użytkownicy, zdalny dostęp do bazy,
 * domeny dodatkowe, poddomeny, FTP i jednorazowe logowanie do panelu (SSO).
 * Część z nich idzie przez metody SDK, a nie przez daFormForSubscription — stąd dwie
 * rzeczy, których pilnujemy tu szczególnie:
 *  - 200 + error=1 od DA to błąd także tam (bez wpisu „utworzono” w audycie),
 *  - SEC-2: konto zawieszone (np. nieopłacone, gdy zawieszenie w DA się nie udało) nie
 *    dostaje żadnej mutacji ani logowania do panelu, niezależnie od ścieżki wywołania.
 * Do tego walidacja nazw z danych klienta przed DA, szczególnie przy kasowaniu.
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(o: { status?: string; get?: Record<string, unknown>; post?: Record<string, unknown> } = {}) {
  const trasyGet: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl&list1=sklep.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    ...o.get,
  };
  const get = jest.fn((path: string, _cfg?: Record<string, unknown>) => odp(trasyGet[path] ?? ''));
  const post = jest.fn((path: string, _body?: unknown, _cfg?: Record<string, unknown>) =>
    odp(o.post?.[path] ?? 'error=0&text=OK'),
  );
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: { update: jest.fn(async () => account) },
  };
  const audit = { record: jest.fn(async () => undefined) };
  const svc = new DirectAdminService(prisma as never, {} as never, {} as never, audit as never);
  jest.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  const sciezki = () => post.mock.calls.map((c) => c[0]);
  return { svc, get, post, audit, wyslane, sciezki };
}

const BLAD_TEKST = 'error=1&text=Przekroczony%20limit%20baz';
const BLAD_JSON = { error: '1', text: 'Przekroczony limit baz' };

describe('Bazy MySQL — tworzenie i usuwanie', () => {
  it.each([
    [{ name: 'sklep;DROP', user: 'sklep', password: 'Haslo1234' }, 'Nazwa bazy'],
    [{ name: '../etc', user: 'sklep', password: 'Haslo1234' }, 'Nazwa bazy'],
    [{ name: 'a'.repeat(17), user: 'sklep', password: 'Haslo1234' }, 'Nazwa bazy'],
    [{ name: 'sklep', user: 'u&passwd=x', password: 'Haslo1234' }, 'Nazwa użytkownika'],
    [{ name: 'sklep', user: 'sklep', password: 'krotkie' }, '8 znaków'],
  ])('odrzuca %j przed DA', async (input, fragment) => {
    const s = stanowisko();
    await expect(s.svc.createHostingMysqlDatabase('s1', 'u1', input)).rejects.toThrow(fragment);
    expect(s.post).not.toHaveBeenCalled();
  });

  it('tworzy bazę: dokładne pola, pełne (prefiksowane) nazwy w wyniku, wpis w audycie', async () => {
    const s = stanowisko();
    const wynik = await s.svc.createHostingMysqlDatabase('s1', 'u1', { name: 'sklep', user: 'sklepu', password: 'Ha&slo=1234' });
    expect(wynik).toEqual({ database: 'klient1_sklep', username: 'klient1_sklepu' });
    expect(s.sciezki()).toEqual(['/CMD_API_DATABASES']);
    expect(s.wyslane()).toMatchObject({ action: 'create', name: 'sklep', user: 'sklepu', passwd: 'Ha&slo=1234', passwd2: 'Ha&slo=1234' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DB_CREATED' }));
  });

  it.each([['tekst', BLAD_TEKST], ['JSON', BLAD_JSON]])(
    'DA odpowiada 200 z błędem (%s) → wyjątek; bez audytu i bez nazw nieistniejącej bazy (migracja by w nią importowała)',
    async (_n, body) => {
      const s = stanowisko({ post: { '/CMD_API_DATABASES': body } });
      await expect(s.svc.createHostingMysqlDatabase('s1', 'u1', { name: 'sklep', user: 'sklep', password: 'Haslo1234' }))
        .rejects.toThrow('Przekroczony limit baz');
      expect(s.audit.record).not.toHaveBeenCalled();
    },
  );

  it('konto zawieszone (SEC-2) → 400 przy tworzeniu i usuwaniu bazy, nic nie idzie do DA', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingMysqlDatabase('s1', 'u1', { name: 'sklep', user: 'sklep', password: 'Haslo1234' }))
      .rejects.toThrow('zawieszone');
    await expect(s.svc.deleteHostingMysqlDatabase('s1', 'u1', 'klient1_sklep')).rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('usuwa dokładnie wskazaną bazę; błąd DA → wyjątek bez wpisu „usunięto”', async () => {
    const ok = stanowisko();
    await ok.svc.deleteHostingMysqlDatabase('s1', 'u1', 'klient1_sklep');
    expect(ok.wyslane()).toEqual({ action: 'delete', select0: 'klient1_sklep' });
    expect(ok.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DB_DELETED' }));

    const zle = stanowisko({ post: { '/CMD_API_DATABASES': 'error=1&text=Baza%20nie%20istnieje' } });
    await expect(zle.svc.deleteHostingMysqlDatabase('s1', 'u1', 'klient1_sklep')).rejects.toThrow('Baza nie istnieje');
    expect(zle.audit.record).not.toHaveBeenCalled();
  });
});

describe('Bazy MySQL — użytkownicy i zdalny dostęp', () => {
  it('nowy użytkownik: CMD_API_DB_USER z dokładnymi polami, pełna nazwa w wyniku', async () => {
    const s = stanowisko();
    await expect(s.svc.createHostingDbUser('s1', 'u1', { db: 'klient1_sklep', user: 'raport', password: 'Haslo1234' }))
      .resolves.toEqual({ username: 'klient1_raport' });
    expect(s.sciezki()).toEqual(['/CMD_API_DB_USER']);
    expect(s.wyslane()).toEqual({ action: 'create', db: 'klient1_sklep', name: 'raport', user: 'raport', passwd: 'Haslo1234', passwd2: 'Haslo1234' });
  });

  it('błąd DA na obu ścieżkach (nowa i zapasowa) → wyjątek, bez audytu', async () => {
    const s = stanowisko({ post: { '/CMD_API_DB_USER': 'error=1&text=Nieznana%20komenda', '/CMD_API_DATABASES': 'error=1&text=Limit%20u%C5%BCytkownik%C3%B3w' } });
    await expect(s.svc.createHostingDbUser('s1', 'u1', { db: 'klient1_sklep', user: 'raport', password: 'Haslo1234' }))
      .rejects.toThrow('Limit użytkowników');
    expect(s.sciezki()).toEqual(['/CMD_API_DB_USER', '/CMD_API_DATABASES']);
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it.each([
    ['tworzenie', (svc: DirectAdminService) => svc.createHostingDbUser('s1', 'u1', { db: 'klient1_sklep', user: 'raport', password: 'Haslo1234' })],
    ['usuwanie', (svc: DirectAdminService) => svc.deleteHostingDbUser('s1', 'u1', { db: 'klient1_sklep', user: 'klient1_raport' })],
    ['zmiana hasła', (svc: DirectAdminService) => svc.changeHostingDbUserPassword('s1', 'u1', { db: 'klient1_sklep', user: 'klient1_raport', password: 'Haslo1234' })],
  ])('konto zawieszone (SEC-2) → %s użytkownika bazy zablokowane', async (_n, akcja) => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(akcja(s.svc)).rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it.each(['1.2.3.4&create=yes', '10.0.0.1\nx', 'host name', ''])('zdalny dostęp: host %j → 400 przed DA', async (host) => {
    const s = stanowisko();
    await expect(s.svc.addHostingDbAccessHost('s1', 'u1', { db: 'klient1_sklep', host })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
  });

  it('zdalny dostęp: wildcard % przechodzi z dokładnymi polami', async () => {
    const s = stanowisko();
    await s.svc.addHostingDbAccessHost('s1', 'u1', { db: 'klient1_sklep', host: '192.168.%' });
    expect(s.wyslane()).toEqual({ action: 'accesshosts', create: 'yes', db: 'klient1_sklep', host: '192.168.%', api: 'yes' });
  });
});

describe('Logowanie do panelu (SSO)', () => {
  it('phpMyAdmin: jednorazowy link na 2 min, w audycie', async () => {
    const s = stanowisko({ post: { '/CMD_API_LOGIN_KEYS': 'error=0&details=https%3A%2F%2Fda.test%3A2222%2FCMD_LOGIN_URL%3Fhash%3Dabc' } });
    await expect(s.svc.createHostingSsoUrl('s1', 'u1', 'phpmyadmin')).resolves.toEqual({ url: 'https://da.test:2222/CMD_LOGIN_URL?hash=abc' });
    expect(s.wyslane()).toMatchObject({ action: 'create', type: 'one_time_url', 'redirect-url': '/CMD_PMA/', expiry: '2m' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_SSO_URL_CREATED' }));
  });

  it('DA nie zwraca adresu (albo error=1) → wyjątek, bez audytu', async () => {
    const s = stanowisko({ post: { '/CMD_API_LOGIN_KEYS': 'error=0&details=javascript%3Aalert(1)' } });
    await expect(s.svc.createHostingSsoUrl('s1', 'u1', 'panel')).rejects.toThrow();
    const z = stanowisko({ post: { '/CMD_API_LOGIN_KEYS': 'error=1&text=Z%C5%82e%20has%C5%82o' } });
    await expect(z.svc.createHostingSsoUrl('s1', 'u1', 'panel')).rejects.toThrow('Złe hasło');
    expect(s.audit.record).not.toHaveBeenCalled();
    expect(z.audit.record).not.toHaveBeenCalled();
  });

  it('konto zawieszone (SEC-2) → brak logowania do panelu (tam klient zrobiłby wszystko ręcznie)', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingSsoUrl('s1', 'u1', 'panel')).rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('Pliki .htaccess (narzędzia WWW, ochrona katalogu) — SEC-2', () => {
  it.each([
    ['narzędzia WWW', (svc: DirectAdminService) => svc.saveHostingWebTools('s1', 'u1', { forceHttps: true })],
    ['ochrona katalogu', (svc: DirectAdminService) => svc.setHostingDirectoryProtection('s1', 'u1', { dir: 'admin', user: 'admin', password: 'tajne123' })],
    ['zdjęcie ochrony', (svc: DirectAdminService) => svc.removeHostingDirectoryProtection('s1', 'u1', 'admin')],
  ])('konto zawieszone → %s bez zapisu plików', async (_n, akcja) => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(akcja(s.svc)).rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('Domeny dodatkowe', () => {
  it.each(['firma', 'a b.pl', 'x&domain=obca.pl', 'żółw.pl'])('dodanie %j → 400 przed DA', async (domain) => {
    const s = stanowisko();
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain })).rejects.toThrow('Nieprawidłowa nazwa domeny');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('dodanie: adres z https:// i ścieżką normalizowany do samej domeny; dokładne pola', async () => {
    const s = stanowisko();
    await s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'https://Nowa.PL/sklep' });
    expect(s.wyslane()).toEqual({ action: 'create', domain: 'nowa.pl', php: 'ON', ssl: 'ON' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_ADDON_DOMAIN_CREATED' }));
  });

  it('dodanie: błąd DA w treści → wyjątek bez audytu', async () => {
    const s = stanowisko({ post: { '/CMD_API_DOMAIN': 'error=1&text=Domena%20istnieje%20na%20serwerze' } });
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'nowa.pl' })).rejects.toThrow('Domena istnieje');
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('dodanie na koncie zawieszonym (SEC-2) → 400 bez DA', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'nowa.pl' })).rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
  });

  it.each(['firma.pl', ' FIRMA.PL '])('usunięcie domeny głównej (%j) → 400; DA skasowałby całą stronę', async (domena) => {
    const s = stanowisko();
    await expect(s.svc.deleteHostingAdditionalDomain('s1', 'u1', domena)).rejects.toThrow('domeny głównej');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('usunięcie domeny dodatkowej: dokładne pola', async () => {
    const s = stanowisko();
    await s.svc.deleteHostingAdditionalDomain('s1', 'u1', 'Sklep.pl');
    expect(s.wyslane()).toEqual({ delete: 'yes', confirmed: 'yes', select0: 'sklep.pl', api: 'yes' });
  });
});

describe('Poddomeny i staging — kasowanie razem z plikami (contents=yes)', () => {
  const kasuj = {
    poddomena: (svc: DirectAdminService, subdomain: string) => svc.deleteHostingSubdomain('s1', 'u1', { domain: 'firma.pl', subdomain }),
    staging: (svc: DirectAdminService, subdomain: string) => svc.deleteHostingStaging('s1', 'u1', { domain: 'firma.pl', subdomain }),
  };

  it.each([
    ['poddomena', '..'], ['poddomena', '../public_html'], ['poddomena', 'a/b'], ['poddomena', 'test\nx'],
    ['staging', '..'], ['staging', '.'], ['staging', 'staging/../..'],
  ] as const)('%s %j → 400, DA nie dostaje polecenia kasowania', async (rodzaj, subdomain) => {
    const s = stanowisko();
    await expect(kasuj[rodzaj](s.svc, subdomain)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
  });

  it.each(['poddomena', 'staging'] as const)('%s: poprawna nazwa → dokładne pola', async (rodzaj) => {
    const s = stanowisko();
    await kasuj[rodzaj](s.svc, 'test-1');
    expect(s.wyslane()).toEqual({ action: 'delete', domain: 'firma.pl', select0: 'test-1', contents: 'yes', api: 'yes' });
  });

  it('tworzenie poddomeny: domena spoza konta → 400 bez DA', async () => {
    const s = stanowisko();
    await expect(s.svc.createHostingSubdomain('s1', 'u1', { domain: 'obca.pl', subdomain: 'test' })).rejects.toThrow('nie jest przypisana');
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('FTP', () => {
  it('tworzenie: dokładne pola (domena z konta, nie od klienta), wpis w audycie', async () => {
    const s = stanowisko();
    await s.svc.createHostingFtpAccount('s1', 'u1', { username: 'transfer', password: 'Ha&slo1234', directory: '/public_html/sklep' });
    expect(s.wyslane()).toEqual({
      action: 'create', user: 'transfer', passwd: 'Ha&slo1234', passwd2: 'Ha&slo1234', domain: 'firma.pl', path: '/public_html/sklep', api: 'yes',
    });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_FTP_CREATED' }));
  });

  it('tworzenie: błąd DA → wyjątek bez audytu; konto zawieszone → 400 bez DA', async () => {
    const zle = stanowisko({ post: { '/CMD_API_FTP': 'error=1&text=Login%20zaj%C4%99ty' } });
    await expect(zle.svc.createHostingFtpAccount('s1', 'u1', { username: 'transfer', password: 'Haslo1234' })).rejects.toThrow('Login zajęty');
    expect(zle.audit.record).not.toHaveBeenCalled();

    const zaw = stanowisko({ status: 'SUSPENDED' });
    await expect(zaw.svc.createHostingFtpAccount('s1', 'u1', { username: 'transfer', password: 'Haslo1234' })).rejects.toThrow('zawieszone');
    expect(zaw.post).not.toHaveBeenCalled();
  });

  it('usuwanie: dokładne pola; błąd DA → wyjątek bez wpisu „usunięto”', async () => {
    const ok = stanowisko();
    await ok.svc.deleteHostingFtpAccount('s1', 'u1', 'transfer@firma.pl');
    expect(ok.wyslane()).toEqual({ action: 'delete', domain: 'firma.pl', user: 'transfer@firma.pl', select0: 'transfer@firma.pl', api: 'yes' });

    const zle = stanowisko({ post: { '/CMD_API_FTP': { error: '1', text: 'Brak konta' } } });
    await expect(zle.svc.deleteHostingFtpAccount('s1', 'u1', 'transfer@firma.pl')).rejects.toThrow('Brak konta');
    expect(zle.audit.record).not.toHaveBeenCalled();
  });

  it('lista: błąd DA → fetchError zamiast pustej listy', async () => {
    const s = stanowisko({ post: { '/CMD_API_FTP': 'error=1&text=FTP%20wy%C5%82%C4%85czone' } });
    expect(await s.svc.listHostingFtpAccounts('s1', 'u1')).toEqual({ rows: [], fetchError: 'FTP wyłączone' });
  });
});
