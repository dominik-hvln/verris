import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@verris/database';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { STAFF_PERMISSION_KEYS } from '../staff-roles/staff-permissions.catalog.js';
import { KontoKlientaAdminController, maskujSekretyCrona } from './konto-klienta.admin.controller.js';

/**
 * PB-42 — podgląd konta klienta przez obsługę: uprawnienie, 404 dla brakującej usługi, wołanie metod DA
 * z identyfikatorem WŁAŚCICIELA (nie operatora), wpis w dzienniku przy każdym odczycie, bez sekretów.
 */
const WLASCICIEL = 'u-wlasciciel';
const OPERATOR = { userId: 's-operator' };

function zbuduj(sub: unknown = { userId: WLASCICIEL, account: { id: 'acc1' } }) {
  const prisma = { subscription: { findUnique: vi.fn(async () => sub) } };
  const directAdmin = {
    listHostingDomainsForSubscription: vi.fn(async () => ({
      domains: [{ name: 'klient.pl' }, { name: 'drugi.pl' }],
      daUsername: 'u1',
      primaryDomain: 'klient.pl',
      fetchError: null,
    })),
    listHostingSubdomains: vi.fn(async () => ({
      rows: [{ id: 'sklep.klient.pl', subdomain: 'sklep', domain: 'klient.pl', url: 'https://sklep.klient.pl' }],
      domains: ['klient.pl'],
      fetchError: null,
    })),
    listHostingDnsRecords: vi.fn(async () => ({
      domain: 'klient.pl',
      records: [{ id: '1', name: 'klient.pl.', type: 'A', value: '203.0.113.5', ttl: 3600 }],
      fetchError: null,
    })),
    listHostingEmailAccounts: vi.fn(async () => ({
      rows: [{ id: 'jan@klient.pl', email: 'jan@klient.pl', quotaMb: 1024, password: 'tajne' }],
      fetchError: null,
    })),
    listHostingEmailForwarders: vi.fn(async () => ({
      rows: [{ id: 'biuro', name: 'biuro', email: 'biuro@klient.pl', destinations: ['jan@klient.pl'] }],
      fetchError: null,
    })),
    listHostingMysqlForSubscription: vi.fn(async () => ({
      databases: [{ name: 'u1_wp' }],
      daUsername: 'u1',
      engine: { name: 'MariaDB', version: '10.11' },
      fetchError: null,
    })),
    getHostingPhpIni: vi.fn(async () => ({ domain: 'klient.pl', values: { memory_limit: '256M' }, wlasneDyrektywy: 0 })),
    listHostingSslCertificates: vi.fn(async () => ({ rows: [], fetchError: 'Serwer hostingowy jest chwilowo niedostępny.' })),
    listHostingCronJobs: vi.fn(async () => ({
      rows: [{ id: '1', schedule: '*/5 * * * *', command: 'mysqldump -pS3kret baza > /tmp/b.sql' }],
      fetchError: null,
    })),
    readHostingLog: vi.fn(async () => ({ domain: 'klient.pl', type: 'error', lines: ['PHP Fatal'], truncated: false, fetchError: null })),
  };
  const php = {
    statusForSubscription: vi.fn(async () => ({
      accountId: 'acc1',
      domain: 'klient.pl',
      version: '8.3',
      availableVersions: ['8.2', '8.3'],
      appliedAt: null,
      lastTask: null,
    })),
  };
  const mailLog = {
    status: vi.fn(async () => ({ wToku: false, wczytano: null, adres: null, wpisy: [], blad: null })),
    zlec: vi.fn(async () => ({ wToku: true, wczytano: null, adres: null, wpisy: [], blad: null })),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const ctrl = new KontoKlientaAdminController(prisma as never, directAdmin as never, php as never, mailLog as never, audit as never);
  return { ctrl, prisma, directAdmin, php, mailLog, audit };
}

async function wpuszcza(metoda: keyof KontoKlientaAdminController, user: { userId: string; role: Role }, perms: string[]) {
  const reflector = new Reflector();
  const kontekst = {
    getHandler: () => KontoKlientaAdminController.prototype[metoda],
    getClass: () => KontoKlientaAdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as never;
  const prisma = { user: { findUnique: async () => ({ staffRole: { permissions: perms } }) } };
  try {
    if (!new RolesGuard(reflector).canActivate(kontekst)) return false;
    return await new StaffPermissionsGuard(reflector, prisma as never).canActivate(kontekst);
  } catch (e) {
    if (e instanceof ForbiddenException) return false;
    throw e;
  }
}

describe('PB-42 KontoKlientaAdminController — uprawnienia', () => {
  it('uprawnienie jest w katalogu', () => {
    expect(STAFF_PERMISSION_KEYS).toContain('ACCOUNT_DIAGNOSTICS_VIEW');
  });

  it.each(['domeny', 'dns', 'poczta', 'bazy', 'phpKonta', 'ssl', 'cron', 'logi', 'logiPoczty', 'zlecLogiPoczty'] as const)(
    '%s: klient nie, staff tylko z ACCOUNT_DIAGNOSTICS_VIEW, admin tak',
    async (m) => {
      expect(await wpuszcza(m, { userId: 'c', role: Role.USER }, ['ACCOUNT_DIAGNOSTICS_VIEW'])).toBe(false);
      expect(await wpuszcza(m, { userId: 's', role: Role.STAFF }, [])).toBe(false);
      expect(await wpuszcza(m, { userId: 's', role: Role.STAFF }, ['SUBSCRIPTIONS_MANAGE', 'CUSTOMERS_VIEW'])).toBe(false);
      expect(await wpuszcza(m, { userId: 's', role: Role.STAFF }, ['ACCOUNT_DIAGNOSTICS_VIEW'])).toBe(true);
      expect(await wpuszcza(m, { userId: 'a', role: Role.ADMIN }, [])).toBe(true);
    },
  );
});

describe('PB-42 KontoKlientaAdminController — odczyty', () => {
  it('nieistniejąca usługa → 404, bez wołania węzła i bez wpisu w dzienniku', async () => {
    const { ctrl, directAdmin, audit } = zbuduj(null);
    await expect(ctrl.dns('brak', undefined, OPERATOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(directAdmin.listHostingDnsRecords).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('usługa bez konta hostingowego (np. sama domena) → 404', async () => {
    const { ctrl, directAdmin } = zbuduj({ userId: WLASCICIEL, account: null });
    await expect(ctrl.poczta('s1', OPERATOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(directAdmin.listHostingEmailAccounts).not.toHaveBeenCalled();
  });

  it('DNS: węzeł pytany w imieniu właściciela usługi, wpis w dzienniku z operatorem i sekcją', async () => {
    const { ctrl, directAdmin, audit } = zbuduj();
    const wynik = await ctrl.dns('s1', 'drugi.pl', OPERATOR);
    expect(directAdmin.listHostingDnsRecords).toHaveBeenCalledWith('s1', WLASCICIEL, 'drugi.pl', expect.objectContaining({ primaryDomain: 'klient.pl' }));
    expect(wynik.domeny).toEqual(['klient.pl', 'drugi.pl']);
    expect(wynik.records).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'OPERATOR_ACCOUNT_VIEWED',
      userId: WLASCICIEL,
      actorUserId: 's-operator',
      details: { subscriptionId: 's1', sekcja: 'dns', domain: 'drugi.pl' },
    });
  });

  it('każda sekcja zapisuje jeden wpis i nigdy nie woła węzła z identyfikatorem operatora', async () => {
    const { ctrl, directAdmin, php, mailLog, audit } = zbuduj();
    await ctrl.domeny('s1', OPERATOR);
    await ctrl.dns('s1', undefined, OPERATOR);
    await ctrl.poczta('s1', OPERATOR);
    await ctrl.bazy('s1', OPERATOR);
    await ctrl.phpKonta('s1', undefined, OPERATOR);
    await ctrl.ssl('s1', OPERATOR);
    await ctrl.cron('s1', OPERATOR);
    await ctrl.logi('s1', { type: 'error', lines: 200 }, OPERATOR);
    await ctrl.logiPoczty('s1', OPERATOR);
    const sekcje = audit.record.mock.calls.map((c) => (c as unknown as [{ details: { sekcja: string } }])[0].details.sekcja);
    expect(sekcje).toEqual(['domeny', 'dns', 'poczta', 'bazy', 'php', 'ssl', 'cron', 'logi', 'logi-poczty']);
    const wywolania = [...Object.values(directAdmin), php.statusForSubscription, mailLog.status].flatMap((f) => f.mock.calls);
    expect(wywolania.length).toBeGreaterThan(9);
    for (const args of wywolania) expect((args as unknown[])[1]).toBe(WLASCICIEL);
  });

  it.each([
    ['domeny', (c: KontoKlientaAdminController) => c.domeny('s1', OPERATOR), 'listHostingSubdomains'],
    ['dns', (c: KontoKlientaAdminController) => c.dns('s1', undefined, OPERATOR), 'listHostingDnsRecords'],
    ['php', (c: KontoKlientaAdminController) => c.phpKonta('s1', undefined, OPERATOR), 'getHostingPhpIni'],
    ['logi', (c: KontoKlientaAdminController) => c.logi('s1', { type: 'error', lines: 200 }, OPERATOR), 'readHostingLog'],
  ] as const)('%s: lista domen czytana z węzła raz i przekazana do odczytu sekcji (bez drugiego odczytu)', async (_s, wolaj, metoda) => {
    const { ctrl, directAdmin } = zbuduj();
    await wolaj(ctrl);
    expect(directAdmin.listHostingDomainsForSubscription).toHaveBeenCalledTimes(1);
    const domeny = await directAdmin.listHostingDomainsForSubscription.mock.results[0].value;
    const args = (directAdmin[metoda].mock.calls as unknown[][])[0];
    expect(args[args.length - 1]).toBe(domeny);
  });

  it('logi poczty: obsługa zleca świeży odczyt bez klienta — w imieniu właściciela, zlecający i wpis w dzienniku to operator', async () => {
    const { ctrl, mailLog, audit } = zbuduj();
    const wynik = await ctrl.zlecLogiPoczty('s1', { address: 'jan@klient.pl' }, OPERATOR);
    expect(mailLog.zlec).toHaveBeenCalledWith('s1', WLASCICIEL, 'jan@klient.pl', 's-operator');
    expect(wynik.wToku).toBe(true);
    expect(audit.record).toHaveBeenCalledWith({
      action: 'OPERATOR_ACCOUNT_VIEWED',
      userId: WLASCICIEL,
      actorUserId: 's-operator',
      details: { subscriptionId: 's1', sekcja: 'logi-poczty', zlecenie: 'wczytanie z serwera', address: 'jan@klient.pl' },
    });
  });

  it('logi poczty: brak usługi → 404 bez zlecenia zadania i bez wpisu', async () => {
    const { ctrl, mailLog, audit } = zbuduj(null);
    await expect(ctrl.zlecLogiPoczty('brak', {}, OPERATOR)).rejects.toBeInstanceOf(NotFoundException);
    expect(mailLog.zlec).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('poczta: tylko adres, rozmiar i cele przekierowań — nic poza tym z odpowiedzi węzła', async () => {
    const { ctrl } = zbuduj();
    const wynik = await ctrl.poczta('s1', OPERATOR);
    expect(wynik).toEqual({
      skrzynki: [{ email: 'jan@klient.pl', quotaMb: 1024 }],
      przekierowania: [{ email: 'biuro@klient.pl', destinations: ['jan@klient.pl'] }],
      fetchError: null,
    });
    expect(JSON.stringify(wynik)).not.toContain('tajne');
  });

  it('cron: hasło w poleceniu zamaskowane', async () => {
    const { ctrl } = zbuduj();
    const wynik = await ctrl.cron('s1', OPERATOR);
    expect(wynik.rows[0].command).toBe('mysqldump -p*** baza > /tmp/b.sql');
  });

  it('PHP: awaria odczytu .user.ini to komunikat w sekcji, wersja konta nadal widoczna', async () => {
    const { ctrl, directAdmin } = zbuduj();
    directAdmin.getHostingPhpIni.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:2222'));
    const wynik = await ctrl.phpKonta('s1', undefined, OPERATOR);
    expect(wynik.wersja).toBe('8.3');
    expect(wynik.ini).toBeNull();
    expect(wynik.iniBlad).toBeTruthy();
    expect(wynik.iniBlad).not.toContain('2222');
  });

  it('SSL: błąd węzła przekazany jako fetchError, nie wyjątek', async () => {
    const { ctrl } = zbuduj();
    await expect(ctrl.ssl('s1', OPERATOR)).resolves.toEqual({ rows: [], fetchError: 'Serwer hostingowy jest chwilowo niedostępny.' });
  });

  it('logi: parametry jak u klienta (typ, domena, liczba linii) trafiają do odczytu i do dziennika', async () => {
    const { ctrl, directAdmin, audit } = zbuduj();
    const wynik = await ctrl.logi('s1', { type: 'access', domain: 'drugi.pl', lines: 500 }, OPERATOR);
    expect(directAdmin.readHostingLog).toHaveBeenCalledWith(
      's1',
      WLASCICIEL,
      { type: 'access', domain: 'drugi.pl', lines: 500 },
      expect.objectContaining({ primaryDomain: 'klient.pl' }),
    );
    expect(wynik.domeny).toEqual(['klient.pl', 'drugi.pl']);
    expect(audit.record.mock.calls[0]).toEqual([
      expect.objectContaining({ details: { subscriptionId: 's1', sekcja: 'logi', type: 'access', domain: 'drugi.pl', lines: 500 } }),
    ]);
  });
});

describe('PB-42 maskujSekretyCrona', () => {
  it.each([
    ['wget -q "https://klient.pl/cron.php?key=abc123&x=1"', 'wget -q "https://klient.pl/cron.php?key=***&x=1"'],
    ['curl https://klient.pl/?token=zzz', 'curl https://klient.pl/?token=***'],
    ['mysqldump -u u1 -pS3kret baza', 'mysqldump -u u1 -p*** baza'],
    ["mysql --password='a b' -e 'select 1'", "mysql --password=*** -e 'select 1'"],
    ['/usr/local/bin/php /home/u1/domains/klient.pl/public_html/wp-cron.php', '/usr/local/bin/php /home/u1/domains/klient.pl/public_html/wp-cron.php'],
    ['mkdir -p /home/u1/tmp && cp -pr a b', 'mkdir -p /home/u1/tmp && cp -pr a b'],
    // Ustalenia recenzenta PB-42 — formy, które wcześniej przechodziły bez maski.
    ['MYSQL_PWD=S3kret mysqldump -u u1 baza > b.sql', 'MYSQL_PWD=*** mysqldump -u u1 baza > b.sql'],
    ['DB_PASS=S3kret php /home/u1/cron.php', 'DB_PASS=*** php /home/u1/cron.php'],
    ["export API_TOKEN='a b'; php x.php", 'export API_TOKEN=***; php x.php'],
    ['cd /home/u1 && SECRET_KEY=abc php x.php', 'cd /home/u1 && SECRET_KEY=*** php x.php'],
    ['curl -u admin:S3kret https://klient.pl/cron', 'curl -u admin:*** https://klient.pl/cron'],
    ["curl --user 'admin:S3 kret' https://klient.pl/cron", "curl --user 'admin:***' https://klient.pl/cron"],
    ['curl -uadmin:S3kret https://klient.pl/cron', 'curl -uadmin:*** https://klient.pl/cron'],
    ['wget -q https://admin:S3kret@klient.pl/cron.php', 'wget -q https://admin:***@klient.pl/cron.php'],
    ['wget --http-password=S3kret https://klient.pl/c', 'wget --http-password=*** https://klient.pl/c'],
    ['wget --http-password S3kret https://klient.pl/c', 'wget --http-password *** https://klient.pl/c'],
    ['wget -O- https://klient.pl/cron.php?cron_key=S3kret', 'wget -O- https://klient.pl/cron.php?cron_key=***'],
    ['curl "https://klient.pl/c?a=1&api-token=zz&b=2"', 'curl "https://klient.pl/c?a=1&api-token=***&b=2"'],
    // -pHASLO tylko jako argument tego samego wywołania mysql/mysqldump — inne polecenia w linii bez zmian.
    ['cp -pr a b && mysqldump -u u1 baza', 'cp -pr a b && mysqldump -u u1 baza'],
    ['mysqldump -u u1 -pS3kret baza && cp -pr a b', 'mysqldump -u u1 -p*** baza && cp -pr a b'],
    ['mysqldump -u u1 -p baza | gzip > b.gz; mkdir -p x', 'mysqldump -u u1 -p baza | gzip > b.gz; mkdir -p x'],
    ['mysql -uu1 -p"S3 kret" baza < x.sql', 'mysql -uu1 -p*** baza < x.sql'],
    // Bez fałszywych masek w zwykłych poleceniach.
    ['PATH=/usr/local/bin php -d memory_limit=256M /home/u1/x.php', 'PATH=/usr/local/bin php -d memory_limit=256M /home/u1/x.php'],
    ['curl -s https://klient.pl/wp-cron.php?doing_wp_cron', 'curl -s https://klient.pl/wp-cron.php?doing_wp_cron'],
  ])('%s', (wej, wyj) => {
    expect(maskujSekretyCrona(wej)).toBe(wyj);
  });
});
