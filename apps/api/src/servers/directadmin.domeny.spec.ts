import { DirectAdminApiError, DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service';

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
  const platformSettings = { getPhpSlotReleases: jest.fn(async () => o.sloty ?? ['8.3', '8.2', '7.4']) };
  const svc = new DirectAdminService(prisma as never, {} as never, platformSettings as never, audit as never);
  jest.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  return { svc, get, post, audit, wyslane };
}

describe('DNS (CMD_API_DNS_CONTROL)', () => {
  it('lista: rekordy z nameN/typeN/valueN/ttlN, domyślnie strefa domeny głównej', async () => {
    const s = stanowisko({ post: { '/CMD_API_DNS_CONTROL': 'error=0&name0=www&type0=CNAME&value0=firma.pl.&ttl0=300&name1=@&type1=MX&value1=10 mx.firma.pl.' } });
    const r = await s.svc.listHostingDnsRecords('s1', 'u1');
    expect(r.domain).toBe('firma.pl');
    expect(r.records).toEqual([
      { id: 'www:CNAME:firma.pl.:0', name: 'www', type: 'CNAME', value: 'firma.pl.', ttl: 300 },
      { id: '@:MX:10 mx.firma.pl.:1', name: '@', type: 'MX', value: '10 mx.firma.pl.', ttl: null },
    ]);
    expect(s.wyslane()).toEqual({ action: 'select', domain: 'firma.pl', api: 'yes' });
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

  it('błąd DA przy dodaniu → wyjątek, bez audytu', async () => {
    const s = stanowisko({ post: { '/CMD_API_DOMAIN_POINTER': { error: '1', text: 'Alias zajęty' } } });
    await expect(s.svc.createHostingDomainPointer('s1', 'u1', { alias: 'firma.com.pl' })).rejects.toThrow('Alias zajęty');
    expect(s.audit.record).not.toHaveBeenCalled();
  });
});

describe('PHP per domena', () => {
  it('odczyt: slot z php1_select zamieniony na wersję z mapy slotów', async () => {
    const s = stanowisko({ get: { '/CMD_API_ADDITIONAL_DOMAINS': 'php1_select=2' } });
    expect(await s.svc.getHostingDomainPhp('s1', 'u1', 'Sklep.pl')).toEqual({
      domain: 'sklep.pl', slotReleases: ['8.3', '8.2', '7.4'], currentSlot: 2, currentVersion: '8.2',
    });
  });

  it('odczyt: slot spoza mapy → wersja nieznana (null), bez zgadywania', async () => {
    const s = stanowisko({ get: { '/CMD_API_ADDITIONAL_DOMAINS': 'php1_select=9' } });
    expect((await s.svc.getHostingDomainPhp('s1', 'u1', 'firma.pl')).currentVersion).toBeNull();
  });

  it('zapis: wersja → numer slotu; wersja spoza mapy i cudza domena nie dochodzą do DA', async () => {
    const s = stanowisko();
    expect(await s.svc.setHostingDomainPhp('s1', 'u1', { domain: 'firma.pl', version: '7.4' })).toEqual({ ok: true, domain: 'firma.pl', version: '7.4', slot: 3 });
    expect(s.wyslane()).toEqual({ action: 'php_selector', save: 'yes', domain: 'firma.pl', php1_select: '3', api: 'yes' });
    await expect(s.svc.setHostingDomainPhp('s1', 'u1', { domain: 'firma.pl', version: '5.6' })).rejects.toThrow('Nieobsługiwana');
    await expect(s.svc.setHostingDomainPhp('s1', 'u1', { domain: 'obca.pl', version: '8.3' })).rejects.toThrow('nie należy');
    expect(s.post).toHaveBeenCalledTimes(1);
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
      action: 'create', minute: '0', hour: '*', day_of_month: '*', month: '*', day_of_week: '*', api: 'yes',
      command: 'cd $HOME/domains/firma.pl/public_html && git pull origin release/2.1 && npm run build # verris-deploy d=firma.pl b=release/2.1',
    });
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
    jest.spyOn(s.svc, 'listHostingCronJobs').mockResolvedValue({
      rows: [
        { id: '1', schedule: '*/15 * * * *', command: 'cd $HOME/domains/firma.pl/public_html && git pull # verris-deploy d=firma.pl' },
        { id: '2', schedule: '0 * * * *', command: 'php artisan schedule:run' },
        { id: '3', schedule: '30 3 * * *', command: 'cd x && git pull origin prod # verris-deploy d=sklep.pl b=prod' },
      ],
      fetchError: null,
    } as never);
    const r = await s.svc.listDeployJobs('s1', 'u1');
    expect(r.rows.map((x) => [x.id, x.domain, x.branch, x.frequency])).toEqual([
      ['1', 'firma.pl', null, 'every_15m'],
      ['3', 'sklep.pl', 'prod', 'daily'],
    ]);
  });
});
