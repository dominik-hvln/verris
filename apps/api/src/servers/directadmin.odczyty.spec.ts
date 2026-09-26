import { NotFoundException } from '@nestjs/common';
import { DirectAdminService } from './directadmin.service.js';

/**
 * X-09 — odczyty DirectAdminService (dotąd bez testów): dane dostępowe i limity, adresy panelu, listy domen,
 * autoresponderów, hostów i użytkowników baz, baz MySQL, stagingu, dyrektyw PHP. Sprawdzamy zawężenie do
 * właściciela (userId w zapytaniu), parsowanie odpowiedzi DA i to, że awaria DA daje komunikat, a nie wyjątek.
 */
function stanowisko(o: { konto?: boolean; bezHasla?: boolean; ns?: [string | null, string | null] } = {}) {
  const server = { hostname: 'n1.verris.pl', ipAddress: '203.0.113.7', daHost: null, daPort: 2222, daUseTls: true, ns1: o.ns?.[0] ?? null, ns2: o.ns?.[1] ?? null, ns3: null, dbEngine: 'MariaDB', dbVersion: '11.4.3' };
  const account = o.konto === false ? null : { id: 'a1', daUsername: 'klient1', daPasswordEnc: o.bezHasla ? null : 'enc', server };
  const findFirst = vi.fn(async (a: { where: { id: string; userId: string } }) => (a.where.userId === 'u1' ? { id: 's1', userId: 'u1', account } : null));
  const prisma = { subscription: { findFirst } };
  const platformSettings = { getHostingNameservers: vi.fn(async () => ({ ns1: 'ns1.verris.pl', ns2: 'ns2.verris.pl', ns3: '' })) };
  const svc = new DirectAdminService(prisma as never, {} as never, platformSettings as never, { record: vi.fn() } as never);
  const get = vi.fn(async (path: string) => ({
    data: path === '/CMD_API_SHOW_USER_USAGE' ? 'quota=512&bandwidth=100&nemails=3&nftp=1&nmysql=2&inode=4000' : 'quota=10240&bandwidth=unlimited&nemails=50&nftp=10&nmysql=10&inode=200000&ssh=ON',
  }));
  const klient = {
    client: { get },
    getDomains: vi.fn(async () => ['firma.pl', 'sklep.pl']),
    listDbUsers: vi.fn(async () => ['klient1_wp']),
    listMysqlDatabases: vi.fn(async () => ['klient1_wp', 'klient1_shop']),
  };
  vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient as never);
  const daGet = vi.fn(async (_s: string, _u: string, path: string, q: Record<string, string>) => {
    if (path === '/CMD_API_EMAIL_AUTORESPONDER') return new URLSearchParams('error=0&biuro=szef@firma.pl&urlop=');
    if (path === '/CMD_API_DATABASES') return new URLSearchParams('list0=localhost&list1=198.51.100.4&error=0');
    if (path === '/CMD_API_SUBDOMAINS') return new URLSearchParams(q.domain === 'firma.pl' ? 'list0=staging&list1=dev' : '');
    return new URLSearchParams();
  });
  Object.assign(svc, {
    daGetForSubscription: daGet,
    syncPrimaryDomainForSubscription: vi.fn(async () => 'firma.pl'),
    probeDbEngineVersion: vi.fn(async () => null),
    assertDomainOwnedBySubscription: vi.fn(async (_s: string, _u: string, d: string) => d),
    readAccountTextFile: vi.fn(async () => '; BEGIN VERRIS PHP (zarządzane przez panel — nie edytuj ręcznie)\nmemory_limit = 512M\n; END VERRIS PHP\n'),
  });
  vi.spyOn(svc, 'listHostingDomainsForSubscription').mockResolvedValue({ domains: [{ name: 'firma.pl' }, { name: 'sklep.pl' }], primaryDomain: 'firma.pl', fetchError: null } as never);
  return { svc, findFirst, klient, daGet, get };
}

describe('dane dostępowe i adresy panelu', () => {
  it('limity z CMD_API_SHOW_USER_USAGE/CONFIG, SSH włączony → port 22, NS z ustawień platformy', async () => {
    const s = stanowisko();
    const info = await s.svc.getConnectionInfo('s1', 'u1');
    expect(s.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's1', userId: 'u1' } }));
    expect(info).toMatchObject({ ipv4: '203.0.113.7', ftpHost: 'n1.verris.pl', sshEnabled: true, sshPort: 22, nameservers: ['ns1.verris.pl', 'ns2.verris.pl'], fetchError: null });
    expect(info.diskMb).toMatchObject({ used: 512, limit: 10240 });
  });

  it('NS węzła mają pierwszeństwo, gdy ustawione oba', async () => {
    const info = await stanowisko({ ns: ['a.ns.pl', 'b.ns.pl'] }).svc.getConnectionInfo('s1', 'u1');
    expect(info.nameservers).toEqual(['a.ns.pl', 'b.ns.pl']);
  });

  it('cudza usługa → 404; usługa bez konta → komunikat zamiast wyjątku', async () => {
    await expect(stanowisko().svc.getConnectionInfo('s1', 'obcy')).rejects.toBeInstanceOf(NotFoundException);
    const info = await stanowisko({ konto: false }).svc.getConnectionInfo('s1', 'u1');
    expect(info.fetchError).toBe('Konto hostingowe nie jest jeszcze gotowe.');
  });

  it('adres panelu: hostname → https z portem; nazwa domeny zakodowana w linkach', () => {
    const s = stanowisko().svc;
    expect(s.hostingPanelDisplayHost({ hostname: null, daHost: null, ipAddress: '203.0.113.7' })).toBe('203.0.113.7');
    const base = s.hostingPanelBaseUrl({ hostname: 'n1.verris.pl', daHost: null, daPort: null, daUseTls: true, ipAddress: null });
    expect(base).toBe('https://n1.verris.pl:2222');
    expect(s.hostingEvolutionLinks(base, 'a/b.pl').fileManagerUrl).toBe('https://n1.verris.pl:2222/evo/user/filemanager/domains/a%2Fb.pl');
  });
});

describe('listy z DirectAdmina', () => {
  it('domeny dodatkowe z oznaczeniem głównej; cudza usługa → pusta lista z komunikatem', async () => {
    const s = stanowisko();
    await expect(s.svc.listHostingAdditionalDomains('s1', 'u1')).resolves.toEqual({
      rows: [{ domain: 'firma.pl', isPrimary: true }, { domain: 'sklep.pl', isPrimary: false }], primary: 'firma.pl', fetchError: null,
    });
    await expect(s.svc.listHostingAdditionalDomains('s1', 'obcy')).resolves.toMatchObject({ rows: [], fetchError: 'Brak konta hostingowego.' });
  });

  it('autorespondery: pola meta DA pominięte, adres z domeną', async () => {
    const r = await stanowisko().svc.listHostingAutoresponders('s1', 'u1');
    expect(r).toEqual({ rows: [{ id: 'biuro', name: 'biuro', email: 'biuro@firma.pl', cc: 'szef@firma.pl' }, { id: 'urlop', name: 'urlop', email: 'urlop@firma.pl', cc: '' }], fetchError: null });
  });

  it('hosty dostępu do bazy: listN z DA, bez nazwy bazy → komunikat bez DA', async () => {
    const s = stanowisko();
    await expect(s.svc.listHostingDbAccessHosts('s1', 'u1', 'klient1_wp')).resolves.toEqual({ hosts: ['localhost', '198.51.100.4'], fetchError: null });
    await expect(s.svc.listHostingDbAccessHosts('s1', 'u1', ' ')).resolves.toEqual({ hosts: [], fetchError: 'Brak nazwy bazy.' });
    expect(s.daGet).toHaveBeenCalledTimes(1);
  });

  it('użytkownicy bazy przez klienta konta; awaria DA → komunikat', async () => {
    const s = stanowisko();
    Object.assign(s.svc, { accountClientForSubscription: vi.fn(async () => ({ client: s.klient })) });
    await expect(s.svc.listHostingDbUsers('s1', 'u1', 'klient1_wp')).resolves.toEqual({ users: ['klient1_wp'], fetchError: null });
    s.klient.listDbUsers.mockRejectedValueOnce(new Error('DA 500'));
    await expect(s.svc.listHostingDbUsers('s1', 'u1', 'klient1_wp')).resolves.toEqual({ users: [], fetchError: 'DA 500' });
  });

  it('bazy MySQL z wersją silnika z telemetrii węzła; brak dostępu DA → komunikat bez wywołania DA', async () => {
    const s = stanowisko();
    await expect(s.svc.listHostingMysqlForSubscription('s1', 'u1')).resolves.toMatchObject({
      databases: [{ name: 'klient1_wp' }, { name: 'klient1_shop' }], daUsername: 'klient1', engine: { name: 'MariaDB', version: '11.4.3' }, fetchError: null,
    });
    const b = stanowisko({ bezHasla: true });
    await expect(b.svc.listHostingMysqlForSubscription('s1', 'u1')).resolves.toMatchObject({ databases: [], fetchError: expect.stringContaining('Brak zapisanego dostępu') });
    expect(b.klient.listMysqlDatabases).not.toHaveBeenCalled();
  });

  it('staging: poddomeny każdej domeny jako środowiska z adresem https', async () => {
    const r = await stanowisko().svc.listHostingStaging('s1', 'u1');
    expect(r.rows).toEqual([
      { id: 'staging.firma.pl', subdomain: 'staging', domain: 'firma.pl', url: 'https://staging.firma.pl' },
      { id: 'dev.firma.pl', subdomain: 'dev', domain: 'firma.pl', url: 'https://dev.firma.pl' },
    ]);
    expect(r.fetchError).toBeNull();
  });

  it('dyrektywy PHP z bloku Verris w .user.ini domeny', async () => {
    const r = await stanowisko().svc.getHostingPhpIni('s1', 'u1', 'firma.pl');
    expect(r).toMatchObject({ domain: 'firma.pl', values: { memory_limit: '512M' } });
  });
});
