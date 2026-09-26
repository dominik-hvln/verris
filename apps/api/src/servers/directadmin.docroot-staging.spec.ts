import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DirectAdminService } from './directadmin.service.js';

/**
 * X-09 — zmiana document root (A-06), SSO administratora do węzła, staging i deploy w DirectAdminService.
 * Granica: klient DA (admin: surowe get/post CUSTOM_HTTPD; konto: listDir i formularze).
 */
function stanowisko(o: { status?: string; katalogi?: { name: string; type: string }[]; config?: string } = {}) {
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', daPasswordEnc: 'enc', serverId: 'srv1' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    server: { findUnique: vi.fn(async (a: { where: { id: string } }) => (a.where.id === 'srv1' ? { id: 'srv1', name: 'Node-PL-01', hostname: 'n1.verris.pl', ipAddress: null } : null)) },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new DirectAdminService(prisma as never, {} as never, {} as never, audit as never);

  const adminGet = vi.fn(async () => ({ data: new URLSearchParams({ config: o.config ?? '' }).toString() }));
  const adminPost = vi.fn(async (_p: string, _b?: unknown) => ({ data: 'error=0&text=OK' }));
  const createOneTimeLoginUrl = vi.fn(async () => 'https://n1.verris.pl:2222/api/login/url?key=jednorazowy');
  vi.spyOn(svc, 'getClientForServer').mockResolvedValue({ client: { get: adminGet, post: adminPost }, createOneTimeLoginUrl } as never);

  const kontoPost = vi.fn(async (_p: string, _b?: unknown) => ({ data: 'error=0&text=OK' }));
  const listDir = vi.fn(async () => o.katalogi ?? []);
  vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue({ listDir, client: { post: kontoPost } } as never);

  const wlasna = vi.fn(async (_s: string, _u: string, d: string) => {
    if (d !== 'firma.pl') throw new BadRequestException('Ta domena nie należy do tej usługi.');
    return d;
  });
  Object.assign(svc, { assertDomainOwnedBySubscription: wlasna });
  vi.spyOn(svc, 'listHostingDomainsForSubscription').mockResolvedValue({ domains: [{ name: 'firma.pl' }], fetchError: null } as never);

  const configWyslany = () => new URLSearchParams(String(adminPost.mock.calls[0]?.[1] ?? '')).get('config');
  const formularz = (n = 0) => Object.fromEntries(new URLSearchParams(String(kontoPost.mock.calls[n]?.[1] ?? '')));
  return { svc, adminPost, kontoPost, listDir, audit, createOneTimeLoginUrl, configWyslany, formularz };
}

describe('document root (A-06, CMD_API_CUSTOM_HTTPD)', () => {
  it('ustawia podkatalog: blok DOCROOT ze ścieżką konta, cudza konfiguracja zostaje, wpis w audycie', async () => {
    const s = stanowisko({ katalogi: [{ name: 'public', type: 'dir' }], config: '|*if SSL|\n# własne\n|*endif|' });
    await expect(s.svc.setHostingDocroot('s1', 'u1', { domain: 'firma.pl', katalog: 'app/public' })).resolves.toEqual({ domain: 'firma.pl', katalog: 'app/public' });
    expect(s.listDir).toHaveBeenCalledWith('/domains/firma.pl/public_html/app');
    expect(s.adminPost.mock.calls[0][0]).toBe('/CMD_API_CUSTOM_HTTPD');
    const config = s.configWyslany()!;
    expect(config).toContain('# własne');
    expect(config).toContain('|?DOCROOT=/home/klient1/domains/firma.pl/public_html/app/public|');
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DOCROOT_SET', details: { subscriptionId: 's1', domain: 'firma.pl', katalog: 'app/public' } }));
  });

  it('powrót do public_html: blok Verris usunięty, bez sprawdzania katalogu', async () => {
    const s = stanowisko({ config: '# verris-docroot-start\n|*if !SUB|\n|?DOCROOT=/home/klient1/domains/firma.pl/public_html/old|\n|*endif|\n# verris-docroot-end\n' });
    await s.svc.setHostingDocroot('s1', 'u1', { domain: 'firma.pl', katalog: '' });
    expect(s.listDir).not.toHaveBeenCalled();
    expect(s.configWyslany()).toBe('');
  });

  it.each([
    ['cudza domena', { domain: 'cudza.pl', katalog: 'public' }, {}],
    ['wyjście z public_html', { domain: 'firma.pl', katalog: '../../etc' }, {}],
    ['katalog nie istnieje', { domain: 'firma.pl', katalog: 'brak' }, { katalogi: [{ name: 'brak', type: 'file' }] }],
    ['konto zawieszone', { domain: 'firma.pl', katalog: 'public' }, { status: 'SUSPENDED', katalogi: [{ name: 'public', type: 'dir' }] }],
  ])('%s → 400 i konfiguracja domeny nietknięta', async (_n, input, opcje) => {
    const s = stanowisko(opcje);
    await expect(s.svc.setHostingDocroot('s1', 'u1', input)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.adminPost).not.toHaveBeenCalled();
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('odczyt: podkatalog z bloku Verris', async () => {
    const s = stanowisko({ config: '# verris-docroot-start\n|*if !SUB|\n|?DOCROOT=/home/klient1/domains/firma.pl/public_html/web|\n|*endif|\n# verris-docroot-end\n' });
    await expect(s.svc.getHostingDocroot('s1', 'u1', 'firma.pl')).resolves.toEqual({ domain: 'firma.pl', katalog: 'web' });
  });
});

describe('SSO administratora do węzła', () => {
  it('link jednorazowy na 2 min, w audycie bez samego linku', async () => {
    const s = stanowisko();
    const r = await s.svc.createNodeAdminSsoUrl('srv1', 'admin1');
    expect(s.createOneTimeLoginUrl).toHaveBeenCalledWith({ redirectUrl: '/', expiry: '2m' });
    expect(r).toEqual({ url: expect.stringContaining('key='), sshHost: 'n1.verris.pl', sshCommand: 'ssh root@n1.verris.pl' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'NODE_ADMIN_SSO_URL_CREATED', details: { serverId: 'srv1', serverName: 'Node-PL-01' } }));
    expect(JSON.stringify(s.audit.record.mock.calls)).not.toContain('jednorazowy');
  });

  it('nieznany serwer → 404 bez linku', async () => {
    const s = stanowisko();
    await expect(s.svc.createNodeAdminSsoUrl('inny', 'admin1')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.createOneTimeLoginUrl).not.toHaveBeenCalled();
  });
});

describe('staging i deploy', () => {
  it('nazwa poddomeny spoza a-z0-9- → 400 bez DA', async () => {
    const s = stanowisko();
    await expect(s.svc.createHostingStaging('s1', 'u1', { domain: 'firma.pl', label: 'a&action=delete' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.createHostingStaging('s1', 'u1', { domain: 'cudza.pl' })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.kontoPost).not.toHaveBeenCalled();
  });

  it('z bazą: poddomena, potem baza z hasłem, nazwy z prefiksem konta', async () => {
    const s = stanowisko();
    const r = await s.svc.createHostingStaging('s1', 'u1', { domain: 'firma.pl', label: 'Test-1', withDatabase: true });
    expect(s.kontoPost.mock.calls.map((c) => c[0])).toEqual(['/CMD_API_SUBDOMAINS', '/CMD_API_DATABASES']);
    expect(s.formularz(0)).toEqual({ action: 'create', domain: 'firma.pl', subdomain: 'test-1', api: 'yes' });
    const baza = s.formularz(1);
    expect(baza).toMatchObject({ action: 'create', name: 'test1', user: 'test1' });
    expect(baza.passwd).toBe(baza.passwd2);
    expect(r).toMatchObject({ env: { url: 'https://test-1.firma.pl' }, database: { name: 'klient1_test1', user: 'klient1_test1', password: baza.passwd } });
  });

  it('staging na zawieszonym koncie → 400 bez DA', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingStaging('s1', 'u1', { domain: 'firma.pl' })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.kontoPost).not.toHaveBeenCalled();
  });

  it('usunięcie zadania deploy: id tylko liczbowy', async () => {
    const s = stanowisko();
    await expect(s.svc.deleteDeployJob('s1', 'u1', '3&action=create')).rejects.toBeInstanceOf(BadRequestException);
    expect(s.kontoPost).not.toHaveBeenCalled();
  });
});
