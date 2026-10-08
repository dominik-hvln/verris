import { DirectAdminApiError, DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service.js';

/**
 * X-09 — domeny w DirectAdminService: DNS, domeny dodatkowe, aliasy, PHP per domena, poddomeny i deploy.
 * Mock na granicy HTTP (axios w prawdziwym DirectAdminClient), więc sprawdzamy dokładne pola dla DA.
 * Pilnujemy:
 *  - domena spoza konta usługi nie dociera do DA (strefa, PHP, poddomena, deploy),
 *  - 200 z error=1 to błąd, a nie „zrobione” + wpis w audycie,
 *  - konto zawieszone (SEC-2) nie wysyła mutacji,
 *  - komenda deploy nie przyjmuje znaków powłoki, a gałąź jest czyszczona.
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(o: { status?: string; get?: Record<string, unknown>; post?: Record<string, unknown>; sloty?: string[] } = {}) {
  const trasyGet: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl&list1=sklep.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    ...o.get,
  };
  const get = vi.fn((path: string, _cfg?: Record<string, unknown>) => odp(trasyGet[path] ?? ''));
  const post = vi.fn((path: string, _body?: unknown, _cfg?: Record<string, unknown>) =>
    odp(o.post?.[path] ?? 'error=0&text=OK'),
  );
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: {
      update: vi.fn(async () => account),
      // Z-10: domena główna innego klienta.
      findFirst: vi.fn(async (a: { where: { domain: { in: string[] } } }) => (a.where.domain.in.includes('cudza.pl') ? { id: 'a2' } : null)),
    },
    domain: { findFirst: vi.fn(async (a: { where: { name: { in: string[] } } }) => (a.where.name.in.includes('zarejestrowana.pl') ? { id: 'd2' } : null)) },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const platformSettings = { getPhpSlotReleases: vi.fn(async () => o.sloty ?? ['8.3', '8.2', '7.4']) };
  const svc = new DirectAdminService(prisma as never, {} as never, platformSettings as never, audit as never);
  vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  return { svc, get, post, audit, wyslane };
}

describe('DNS (CMD_API_DNS_CONTROL)', () => {
  it('lista: GET json=yes → records[], domyślnie strefa domeny głównej (nie POST action=select — to usuwanie)', async () => {
    const s = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [
      { name: 'www', type: 'CNAME', value: 'firma.pl.', ttl: '300' },
      { name: 'firma.pl.', type: 'MX', value: '10 mail' },
    ] } } });
    const r = await s.svc.listHostingDnsRecords('s1', 'u1');
    expect(r.domain).toBe('firma.pl');
    expect(r.records).toEqual([
      { id: 'www:CNAME:firma.pl.:0', name: 'www', type: 'CNAME', value: 'firma.pl.', ttl: 300 },
      { id: 'firma.pl.:MX:10 mail:1', name: 'firma.pl.', type: 'MX', value: '10 mail', ttl: null },
    ]);
    expect(s.get).toHaveBeenCalledWith('/CMD_API_DNS_CONTROL', expect.objectContaining({ params: expect.objectContaining({ domain: 'firma.pl', json: 'yes' }) }));
    expect(s.post).not.toHaveBeenCalled();
  });

  it('lista: odpowiedź bez records (np. strona HTML) → fetchError, nie „pusta strefa”', async () => {
    const s = stanowisko({ get: { '/CMD_API_DNS_CONTROL': '<html>' } });
    const r = await s.svc.listHostingDnsRecords('s1', 'u1');
    expect(r.records).toEqual([]);
    expect(r.fetchError).toBeTruthy();
  });

  it('usunięcie: action=select + <typ>recs0 „name=…&value=…” ze spacją jako %20 (DA czyta „+” dosłownie); DA „usunął”, a rekord został → 400', async () => {
    const s = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [] } } });
    await s.svc.deleteHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', name: 'firma.pl.', type: 'MX', value: '10 mail' });
    expect(s.wyslane()).toEqual({ action: 'select', delete: 'yes', domain: 'firma.pl', mxrecs0: 'name=firma.pl.&value=10%20mail', api: 'yes' });
    const z = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [{ name: 'x', type: 'A', value: '1.2.3.4' }] } } });
    await expect(z.svc.deleteHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', name: 'x', type: 'A', value: '1.2.3.4' })).rejects.toThrow('nie usunął');
  });

  it('usunięcie zapisem ze strefy — t1 04.10: „Cofnij” asystenta podawał _dmarc bez cudzysłowów, DA nic nie usunął, panel „cofnięto”', async () => {
    const rek = { name: '_dmarc', type: 'TXT', value: '"v=DMARC1; p=quarantine"' };
    const s = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [rek] } } });
    await expect(s.svc.deleteHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', name: '_dmarc.firma.pl.', type: 'TXT', value: 'v=DMARC1; p=quarantine' }))
      .rejects.toThrow('nie usunął'); // strefa w atrapie się nie zmienia — kontrola po zapisie łapie rekord mimo innego zapisu
    expect(s.wyslane().txtrecs0).toBe(`name=_dmarc&value=${encodeURIComponent('"v=DMARC1; p=quarantine"')}`);
  });

  it('edycja: jedno action=edit ze starym rekordem w <typ>recs0 — także zmiana samego TTL; sprawdzenie strefy po zapisie', async () => {
    const val = '0 issue "letsencrypt.org"';
    const s = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [{ name: '@', type: 'CAA', value: val, ttl: '1800' }] } } });
    await s.svc.editHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', old: { name: '@', type: 'CAA', value: val }, next: { name: '@', type: 'CAA', value: val, ttl: 1800 } });
    expect(s.wyslane()).toEqual({
      action: 'edit', domain: 'firma.pl', type: 'CAA', caarecs0: `name=%40&value=${encodeURIComponent(val)}`, name: '@', value: val, ttl: '1800', api: 'yes',
    });
    expect(s.post).toHaveBeenCalledTimes(1);
  });

  it('edycja: DA „zapisał”, ale TTL/wartość bez zmian albo stary rekord został → 400 (bez fałszywego „zapisano”)', async () => {
    const stary = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [{ name: 'www', type: 'A', value: '1.1.1.1', ttl: '3600' }] } } });
    await expect(stary.svc.editHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', old: { name: 'www', type: 'A', value: '1.1.1.1' }, next: { name: 'www', type: 'A', value: '1.1.1.1', ttl: 300 } }))
      .rejects.toThrow('nie zapisał');
    const obaj = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [{ name: 'www.firma.pl.', type: 'A', value: '1.1.1.1', ttl: '3600' }, { name: 'www', type: 'A', value: '2.2.2.2', ttl: '3600' }] } } });
    await expect(obaj.svc.editHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', old: { name: 'www', type: 'A', value: '1.1.1.1' }, next: { name: 'www', type: 'A', value: '2.2.2.2', ttl: 3600 } }))
      .rejects.toThrow('nie zapisał');
  });

  it('edycja ze zmianą typu: dodanie nowego, potem usunięcie starego; cudza strefa nie dochodzi do DA', async () => {
    const s = stanowisko({ get: { '/CMD_API_DNS_CONTROL': { records: [] } } });
    await s.svc.editHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', old: { name: 'www', type: 'A', value: '1.1.1.1' }, next: { name: 'www', type: 'CNAME', value: 'firma.pl.' } });
    expect(s.wyslane(0)).toMatchObject({ action: 'add', type: 'CNAME' });
    expect(s.wyslane(1)).toMatchObject({ action: 'select', delete: 'yes', arecs0: 'name=www&value=1.1.1.1' });
    const z = stanowisko();
    await expect(z.svc.editHostingDnsRecord('s1', 'u1', { domain: 'obca.pl', old: { name: 'x', type: 'A', value: '1.1.1.1' }, next: { name: 'x', type: 'A', value: '2.2.2.2' } })).rejects.toThrow();
    expect(z.post).not.toHaveBeenCalled();
  });

  it('lista cudzej domeny → 400 bez pytania DA o strefę', async () => {
    const s = stanowisko();
    await expect(s.svc.listHostingDnsRecords('s1', 'u1', 'obca.pl')).rejects.toThrow('nie jest przypisana');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('dodanie: dokładne pola, TTL domyślnie 3600; błąd DA → wyjątek', async () => {
    const s = stanowisko();
    await s.svc.createHostingDnsRecord('s1', 'u1', { domain: 'sklep.pl', name: 'www', type: 'A', value: '1.2.3.4' });
    expect(s.wyslane()).toEqual({ action: 'add', domain: 'sklep.pl', name: 'www', type: 'A', value: '1.2.3.4', ttl: '3600', api: 'yes' });
    const z = stanowisko({ post: { '/CMD_API_DNS_CONTROL': 'error=1&text=Rekord%20istnieje' } });
    await expect(z.svc.createHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', name: 'www', type: 'A', value: '1.2.3.4' })).rejects.toThrow('Rekord istnieje');
  });

  it('dodanie i usunięcie w cudzej strefie nie dochodzą do DA', async () => {
    const s = stanowisko();
    await expect(s.svc.createHostingDnsRecord('s1', 'u1', { domain: 'obca.pl', name: 'x', type: 'A', value: '1.2.3.4' })).rejects.toThrow();
    await expect(s.svc.deleteHostingDnsRecord('s1', 'u1', { domain: 'obca.pl', name: 'x', type: 'A', value: '1.2.3.4' })).rejects.toThrow();
    expect(s.post).not.toHaveBeenCalled();
  });

  it('konto zawieszone: brak mutacji strefy', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingDnsRecord('s1', 'u1', { domain: 'firma.pl', name: 'x', type: 'A', value: '1.2.3.4' })).rejects.toThrow();
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('Domeny dodatkowe (CMD_API_DOMAIN)', () => {
  it('dodanie: nazwa oczyszczona z https:// i ścieżki, audyt po sukcesie', async () => {
    const s = stanowisko();
    await s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'https://Nowa.PL/sklep' });
    expect(s.wyslane()).toEqual({ action: 'create', domain: 'nowa.pl', php: 'ON', ssl: 'ON' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_ADDON_DOMAIN_CREATED' }));
  });

  it('odmowa DA → DirectAdminApiError z powodem (API pokaże 400, nie 500), bez audytu', async () => {
    const s = stanowisko({ post: { '/CMD_API_DOMAIN': 'error=1&text=Domena%20ju%C5%BC%20istnieje' } });
    const e = await s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'nowa.pl' }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(DirectAdminApiError);
    expect((e as DirectAdminApiError).daText).toBe('Domena już istnieje');
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('nieprawidłowa nazwa albo konto zawieszone → nic nie idzie do DA', async () => {
    await expect(stanowisko().svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'bez-kropki' })).rejects.toThrow('Nieprawidłowa');
    const z = stanowisko({ status: 'SUSPENDED' });
    await expect(z.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'nowa.pl' })).rejects.toThrow();
    expect(z.post).not.toHaveBeenCalled();
  });

  it('usunięcie: domeny głównej nie da się usunąć; inna idzie jako select0 z potwierdzeniem', async () => {
    const s = stanowisko();
    await expect(s.svc.deleteHostingAdditionalDomain('s1', 'u1', 'FIRMA.pl')).rejects.toThrow('domeny głównej');
    await s.svc.deleteHostingAdditionalDomain('s1', 'u1', 'sklep.pl');
    expect(s.wyslane()).toEqual({ delete: 'yes', confirmed: 'yes', select0: 'sklep.pl', api: 'yes' });
  });
});

describe('Aliasy domeny (CMD_API_DOMAIN_POINTER)', () => {
  it('lista: klucze odpowiedzi to aliasy, pola techniczne pominięte', async () => {
    const s = stanowisko({ get: { '/CMD_API_DOMAIN_POINTER': 'firma.com.pl=alias&stara.pl=pointer&error=0&text=' } });
    expect((await s.svc.listHostingDomainPointers('s1', 'u1')).rows).toEqual([
      { alias: 'firma.com.pl', type: 'alias' },
      { alias: 'stara.pl', type: 'pointer' },
    ]);
  });

  it('dodanie: alias do domeny głównej; alias = domena główna → 400', async () => {
    const s = stanowisko();
    await s.svc.createHostingDomainPointer('s1', 'u1', { alias: 'http://Firma.com.pl/' });
    expect(s.wyslane()).toEqual({ action: 'add', domain: 'firma.pl', from: 'firma.com.pl', alias: 'yes', api: 'yes' });
    await expect(s.svc.createHostingDomainPointer('s1', 'u1', { alias: 'firma.pl' })).rejects.toThrow('tożsamy');
  });

  it('Z-10: domena albo subdomena innego klienta Verris (konto lub rejestracja) → 400 bez wywołania DA', async () => {
    const s = stanowisko();
    await expect(s.svc.createHostingDomainPointer('s1', 'u1', { alias: 'cudza.pl' })).rejects.toThrow('innym koncie');
    await expect(s.svc.createHostingDomainPointer('s1', 'u1', { alias: 'poczta.cudza.pl' })).rejects.toThrow('innym koncie');
    await expect(s.svc.createHostingAdditionalDomain('s1', 'u1', { domain: 'zarejestrowana.pl' })).rejects.toThrow('innym koncie');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('błąd DA przy dodaniu → wyjątek, bez audytu', async () => {
    const s = stanowisko({ post: { '/CMD_API_DOMAIN_POINTER': { error: '1', text: 'Alias zajęty' } } });
    await expect(s.svc.createHostingDomainPointer('s1', 'u1', { alias: 'firma.com.pl' })).rejects.toThrow('Alias zajęty');
    expect(s.audit.record).not.toHaveBeenCalled();
  });
});

describe('Poddomeny (CMD_API_SUBDOMAINS)', () => {
  it('lista: obie postaci odpowiedzi DA (klucz albo listN), po każdej domenie konta', async () => {
    const s = stanowisko();
    s.get.mockImplementation((path: string, cfg?: Record<string, unknown>) => {
      if (path === '/CMD_API_SHOW_DOMAINS') return odp('list0=firma.pl&list1=sklep.pl');
      if (path === '/CMD_API_SHOW_USER_CONFIG') return odp('domain=firma.pl');
      const domena = (cfg?.params as Record<string, string>)?.domain;
      return odp(domena === 'firma.pl' ? 'blog=&dev=' : 'list0=b2b&error=0');
    });
    expect((await s.svc.listHostingSubdomains('s1', 'u1')).rows.map((r) => r.id)).toEqual(['blog.firma.pl', 'dev.firma.pl', 'b2b.sklep.pl']);
  });

  it('tworzenie: etykieta a-z0-9-, domena z konta; inaczej 400 bez DA', async () => {
    const s = stanowisko();
    expect(await s.svc.createHostingSubdomain('s1', 'u1', { domain: 'firma.pl', subdomain: 'Blog' })).toEqual({ ok: true, url: 'https://blog.firma.pl' });
    expect(s.wyslane()).toEqual({ action: 'create', domain: 'firma.pl', subdomain: 'blog', api: 'yes' });
    await expect(s.svc.createHostingSubdomain('s1', 'u1', { domain: 'firma.pl', subdomain: 'a.b' })).rejects.toThrow('Nazwa poddomeny');
    await expect(s.svc.createHostingSubdomain('s1', 'u1', { domain: 'obca.pl', subdomain: 'blog' })).rejects.toThrow('nie jest przypisana');
    expect(s.post).toHaveBeenCalledTimes(1);
  });

  it('usunięcie (kasuje pliki): „..” i „/” odrzucone przed DA', async () => {
    const s = stanowisko();
    await expect(s.svc.deleteHostingSubdomain('s1', 'u1', { domain: 'firma.pl', subdomain: '../public_html' })).rejects.toThrow('Nieprawidłowa');
    await s.svc.deleteHostingSubdomain('s1', 'u1', { domain: 'firma.pl', subdomain: 'blog' });
    expect(s.wyslane()).toEqual({ action: 'delete', domain: 'firma.pl', select0: 'blog', contents: 'yes', api: 'yes' });
  });
});

describe('Deploy z Git (cron)', () => {
  it('komenda: cd do docroot domeny, git pull z gałęzią, build, znacznik Verris', async () => {
    const s = stanowisko();
    await s.svc.createDeployJob('s1', 'u1', { domain: 'firma.pl', branch: 'release/2.1', buildCommand: 'npm run build', frequency: 'hourly' });
    expect(s.wyslane()).toEqual({
      action: 'create', minute: '0', hour: '*', dayofmonth: '*', month: '*', dayofweek: '*', api: 'yes',
      command: 'cd $HOME/domains/firma.pl/public_html && git pull origin release/2.1 && npm run build # verris-deploy d=firma.pl b=release/2.1',
    });
  });

  it('podkatalog repozytorium (t1 04.10: repo w public_html/payload, cron ciągnął katalog główny)', async () => {
    const s = stanowisko();
    await s.svc.createDeployJob('s1', 'u1', { domain: 'firma.pl', dir: '/payload/', frequency: 'every_15m' });
    expect(s.wyslane().command).toBe('cd $HOME/domains/firma.pl/public_html/payload && git pull # verris-deploy d=firma.pl k=payload');
  });

  it.each(['../x', 'a/../../b', 'a b', 'a;rm', '$HOME'])('podkatalog „%s” → 400 bez DA', async (dir) => {
    const s = stanowisko();
    await expect(s.svc.createDeployJob('s1', 'u1', { domain: 'firma.pl', dir, frequency: 'daily' })).rejects.toThrow('katalog');
    expect(s.post).not.toHaveBeenCalled();
  });

  it.each(['main; rm -rf ~', '--upload-pack=x', 'a..b', 'feat branch'])('gałąź „%s” → 400 zamiast cichego „czyszczenia”', async (branch) => {
    const s = stanowisko();
    await expect(s.svc.createDeployJob('s1', 'u1', { domain: 'firma.pl', branch, frequency: 'daily' })).rejects.toThrow('Nazwa gałęzi');
    expect(s.post).not.toHaveBeenCalled();
  });

  it.each(['npm run build; curl x', 'a && b', 'a | b', 'echo `id`', 'echo $HOME', 'a > plik'])(
    'build ze znakami powłoki (%s) → 400 bez DA',
    async (build) => {
      const s = stanowisko();
      await expect(s.svc.createDeployJob('s1', 'u1', { domain: 'firma.pl', buildCommand: build, frequency: 'daily' })).rejects.toThrow('niedozwolone');
      expect(s.post).not.toHaveBeenCalled();
    },
  );

  it('cudza domena nie trafia do crona', async () => {
    const s = stanowisko();
    await expect(s.svc.createDeployJob('s1', 'u1', { domain: 'obca.pl', frequency: 'daily' })).rejects.toThrow('nie jest przypisana');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('lista: tylko crony ze znacznikiem Verris, częstotliwość z harmonogramu', async () => {
    const s = stanowisko();
    vi.spyOn(s.svc, 'listHostingCronJobs').mockResolvedValue({
      rows: [
        { id: '1', schedule: '*/15 * * * *', command: 'cd $HOME/domains/firma.pl/public_html && git pull # verris-deploy d=firma.pl' },
        { id: '2', schedule: '0 * * * *', command: 'php artisan schedule:run' },
        { id: '3', schedule: '30 3 * * *', command: 'cd x && git pull origin prod # verris-deploy d=sklep.pl b=prod k=app/web' },
      ],
      fetchError: null,
    } as never);
    const r = await s.svc.listDeployJobs('s1', 'u1');
    expect(r.rows.map((x) => [x.id, x.domain, x.branch, x.dir, x.frequency])).toEqual([
      ['1', 'firma.pl', null, null, 'every_15m'],
      ['3', 'sklep.pl', 'prod', 'app/web', 'daily'],
    ]);
  });
});

describe('B-05 — .user.ini domeny', () => {
  it('zapis: blok panelu na górze, dyrektywy klienta zostają; cudza domena i zła wartość nie dochodzą do DA', async () => {
    const s = stanowisko({ get: {
      '/CMD_API_FILE_MANAGER': 'error=0&%2Fdomains%2Fsklep.pl%2Fpublic_html%2F.user.ini=type%3Dfile%26size%3D30',
      '/CMD_FILE_MANAGER/domains/sklep.pl/public_html/.user.ini': 'session.gc_maxlifetime = 1440\n',
    } });
    s.get.mockImplementation((path: string) => {
      const t: Record<string, unknown> = {
        '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl&list1=sklep.pl',
        '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
        '/CMD_API_FILE_MANAGER': 'error=0&%2Fdomains%2Fsklep.pl%2Fpublic_html%2F.user.ini=type%3Dfile%26size%3D30',
        '/CMD_FILE_MANAGER/domains/sklep.pl/public_html/.user.ini': Buffer.from('session.gc_maxlifetime = 1440\n'),
      };
      return odp(t[path] ?? '');
    });
    await s.svc.setHostingPhpIni('s1', 'u1', { domain: 'sklep.pl', values: { memory_limit: '512M', upload_max_filesize: '64M' } });
    const pola = s.wyslane();
    expect(pola).toMatchObject({ action: 'edit', path: '/domains/sklep.pl/public_html', filename: '.user.ini' });
    expect(pola.text).toBe('; BEGIN VERRIS PHP (zarządzane przez panel — nie edytuj ręcznie)\nmemory_limit = 512M\nupload_max_filesize = 64M\n; END VERRIS PHP\n\nsession.gc_maxlifetime = 1440\n');
    // LiteSpeed nie czyta .user.ini bez LSPHP_ENABLE_USER_INI — to samo jako php_value w .htaccess (retest D3 29.09).
    expect(s.wyslane(1)).toMatchObject({ action: 'edit', path: '/domains/sklep.pl/public_html', filename: '.htaccess' });
    expect(s.wyslane(1).text).toBe('# BEGIN VERRIS PHP (zarządzane przez panel — nie edytuj ręcznie)\n<IfModule LiteSpeed>\nphp_value memory_limit 512M\nphp_value upload_max_filesize 64M\n</IfModule>\n# END VERRIS PHP\n');
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_PHP_INI_SET' }));

    await expect(s.svc.setHostingPhpIni('s1', 'u1', { domain: 'obca.pl', values: { memory_limit: '512M' } })).rejects.toThrow('nie należy');
    await expect(s.svc.setHostingPhpIni('s1', 'u1', { domain: 'sklep.pl', values: { auto_prepend_file: '/tmp/x' } as never })).rejects.toThrow('nie jest dostępna');
    expect(s.post).toHaveBeenCalledTimes(2);
  });

  it('konto zawieszone: brak zapisu', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.setHostingPhpIni('s1', 'u1', { domain: 'firma.pl', values: { memory_limit: '256M' } })).rejects.toThrow();
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('L-06 — wynik ostatniego uruchomienia crona', () => {
  type Czytnik = { readAccountTextFile: (k: unknown, p: string) => Promise<string> };
  it('czyta ~/.verris-cron/<klucz>.log, zwraca koniec długiego wyniku', async () => {
    const s = stanowisko();
    const spy = vi.spyOn(s.svc as unknown as Czytnik, 'readAccountTextFile').mockResolvedValue('x'.repeat(20_010));
    const r = await s.svc.getHostingCronOutput('s1', 'u1', 'abc123');
    expect(spy).toHaveBeenCalledWith(expect.anything(), '/.verris-cron/abc123.log');
    expect(r).toMatchObject({ obciete: true });
    expect(r.output).toHaveLength(20_000);
  });

  it('klucz ze ścieżką → 400; brak katalogu (pierwsze uruchomienie przed nami) → pusty wynik, inny błąd DA → dalej', async () => {
    const s = stanowisko();
    await expect(s.svc.getHostingCronOutput('s1', 'u1', '../x')).rejects.toThrow('Nieprawidłowy klucz');
    const spy = vi.spyOn(s.svc as unknown as Czytnik, 'readAccountTextFile');
    spy.mockRejectedValueOnce(new DirectAdminApiError('x', 'Directory does not exist'));
    await expect(s.svc.getHostingCronOutput('s1', 'u1', 'abc123')).resolves.toMatchObject({ output: '' });
    spy.mockRejectedValueOnce(new DirectAdminApiError('x', 'Permission denied'));
    await expect(s.svc.getHostingCronOutput('s1', 'u1', 'abc123')).rejects.toThrow('x');
  });
});

describe('assertDomainOwnedBySubscription — awaria serwera to nie „cudza domena”', () => {
  it('brak listy domen z powodu błędu serwera → komunikat o niedostępności', async () => {
    const svc = new DirectAdminService({} as never, {} as never, {} as never, {} as never);
    vi.spyOn(svc, 'listHostingDomainsForSubscription').mockResolvedValue({ domains: [], daUsername: 'k', primaryDomain: 'a.pl', fetchError: 'ECONNREFUSED' });
    await expect(svc.assertDomainOwnedBySubscription('s1', 'u1', 'a.pl')).rejects.toThrow('chwilowo niedostępny');
    vi.spyOn(svc, 'listHostingDomainsForSubscription').mockResolvedValue({ domains: [{ name: 'b.pl' }], daUsername: 'k', primaryDomain: 'b.pl', fetchError: null });
    await expect(svc.assertDomainOwnedBySubscription('s1', 'u1', 'a.pl')).rejects.toThrow('nie należy do tej usługi');
  });
});

describe('usunięcie domeny dodatkowej będącej poddomeną — delegacja w strefie rodzica (t1, 08.10)', () => {
  // DA przy dodaniu domeny sklep.firma.pl dopisuje do strefy firma.pl rekordy NS (i DS przy DNSSEC — „automated
  // adding of the DS records over to the parent zone”, https://docs.directadmin.com/other-hosting-services/dns/maintaining-records.html),
  // a przy usunięciu domeny ich nie zdejmuje: w d3.hvln.pl zostały sieroty test3/4/5, z09.
  const strefa = {
    records: [
      { name: 'firma.pl.', type: 'NS', value: 'ns3.verris.pl.' },
      { name: 'firma.pl.', type: 'NS', value: 'ns4.verris.pl.' },
      { name: 'sklep.firma.pl.', type: 'NS', value: 'ns3.verris.pl.' },
      { name: 'sklep.firma.pl.', type: 'NS', value: 'ns4.verris.pl.' },
      { name: 'sklep.firma.pl.', type: 'DS', value: '55243 13 2 ABCD' },
      { name: 'obcy.firma.pl.', type: 'NS', value: 'ns1.inny.pl.' },
      { name: 'sklep.firma.pl.', type: 'A', value: '1.2.3.4' },
    ],
  };

  it('zdejmuje NS (nasze serwery nazw) i DS delegacji, nie rusza innych rekordów', async () => {
    const s = stanowisko({ get: { '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl&list1=sklep.firma.pl', '/CMD_API_DNS_CONTROL': strefa } });
    await s.svc.deleteHostingAdditionalDomain('s1', 'u1', 'sklep.firma.pl');
    expect(s.wyslane(0)).toEqual({ delete: 'yes', confirmed: 'yes', select0: 'sklep.firma.pl', api: 'yes' });
    const usuniete = s.post.mock.calls.slice(1).map((c) => Object.fromEntries(new URLSearchParams(String(c[1]))));
    expect(usuniete).toEqual([
      { action: 'select', delete: 'yes', domain: 'firma.pl', nsrecs0: 'name=sklep.firma.pl.&value=ns3.verris.pl.', api: 'yes' },
      { action: 'select', delete: 'yes', domain: 'firma.pl', nsrecs0: 'name=sklep.firma.pl.&value=ns4.verris.pl.', api: 'yes' },
      { action: 'select', delete: 'yes', domain: 'firma.pl', dsrecs0: 'name=sklep.firma.pl.&value=55243%2013%202%20ABCD', api: 'yes' },
    ]);
  });

  it('domena niebędąca poddomeną innej na koncie — tylko polecenie usunięcia', async () => {
    const s = stanowisko({ get: { '/CMD_API_DNS_CONTROL': strefa } });
    await s.svc.deleteHostingAdditionalDomain('s1', 'u1', 'sklep.pl');
    expect(s.post).toHaveBeenCalledTimes(1);
  });
});
