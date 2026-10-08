import { BadRequestException } from '@nestjs/common';
import { MigrationDiscoveryService, sciezkaFtpPleska, stronyCpanel, stronyDirectAdmin } from './migration-discovery.service.js';

/**
 * 08.10 (uwaga Dominika): klient z kilkoma stronami na starym hostingu chce przenieść jedną — kreator dostaje listę
 * stron z katalogiem względem startu FTP konta, a nie samą liczbę domen i „/httpdocs” dla każdej.
 */
type Odp = { status: number; body: string; insecureTlsUsed: boolean };
function serwis(trasy: (path: string, body?: string) => Odp) {
  const svc = new MigrationDiscoveryService({ record: async () => undefined } as never);
  const http = vi
    .spyOn(svc as unknown as { panelHttp: (...a: unknown[]) => Promise<Odp> }, 'panelHttp')
    .mockImplementation(async (...a: unknown[]) => trasy(a[2] as string, (a[5] as { body?: string } | undefined)?.body));
  const prywatne = svc as unknown as Record<string, (...a: unknown[]) => Promise<{ sites: unknown[]; databases: unknown[]; primaryDomain: string | null; ftpHint: unknown }>>;
  return { svc, http, prywatne };
}
const ok = (body: string): Odp => ({ status: 200, body, insecureTlsUsed: false });

describe('cPanel — strony z DomainInfo::domains_data', () => {
  it('katalog względem katalogu domowego; poddomena-bliźniak domeny dodatkowej pominięta', () => {
    const s = stronyCpanel(
      [{ domain: 'firma.pl', documentroot: '/home/u/public_html', homedir: '/home/u' }],
      [{ domain: 'Sklep.pl', documentroot: '/home/u/sklep.pl', homedir: '/home/u' }],
      [
        { domain: 'sklep.firma.pl', documentroot: '/home/u/sklep.pl', homedir: '/home/u' },
        { domain: 'blog.firma.pl', documentroot: '/home/u/public_html/blog/', homedir: '/home/u' },
        { domain: 'obcy.pl', documentroot: '/var/www/x', homedir: '/home/u' },
      ],
    );
    expect(s).toEqual([
      { domain: 'firma.pl', kind: 'main', ftpPath: '/public_html' },
      { domain: 'sklep.pl', kind: 'addon', ftpPath: '/sklep.pl' },
      { domain: 'blog.firma.pl', kind: 'sub', ftpPath: '/public_html/blog' },
      { domain: 'obcy.pl', kind: 'sub', ftpPath: null },
    ]);
  });

  it('main_domain jako obiekt (przykład w dokumentacji) trafia do wyniku wykrywania', async () => {
    const { prywatne } = serwis((path) =>
      path.startsWith('/execute/DomainInfo')
        ? ok(JSON.stringify({ result: { status: 1, data: { main_domain: { domain: 'firma.pl', documentroot: '/home/u/public_html', homedir: '/home/u' }, addon_domains: [], sub_domains: [], parked_domains: [] } } }))
        : ok(JSON.stringify({ result: { status: 1, data: [] } })),
    );
    const w = await prywatne.discoverCpanel!('h.pl', 2083, 'u', 'p', []);
    expect(w.sites).toEqual([{ domain: 'firma.pl', kind: 'main', ftpPath: '/public_html' }]);
  });
});

describe('DirectAdmin — CMD_API_DOMAIN?action=document_root', () => {
  it('strony i poddomeny z katalogami względem katalogu domowego', () => {
    const s = stronyDirectAdmin(
      {
        'sklep.pl': { public_html: '/home/u/domains/sklep.pl/public_html', private_html: '/home/u/domains/sklep.pl/private_html' },
        'firma.pl': {
          public_html: '/home/u/domains/firma.pl/public_html',
          subdomains: { blog: { public_html: '/home/u/domains/firma.pl/public_html/blog' } },
        },
      },
      'firma.pl',
    );
    expect(s).toEqual([
      { domain: 'firma.pl', kind: 'main', ftpPath: '/domains/firma.pl/public_html' },
      { domain: 'sklep.pl', kind: 'addon', ftpPath: '/domains/sklep.pl/public_html' },
      { domain: 'blog.firma.pl', kind: 'sub', ftpPath: '/domains/firma.pl/public_html/blog' },
    ]);
  });

  it('panel bez action=document_root — domyślny układ /domains/<domena>/public_html', async () => {
    const { prywatne } = serwis((path) => {
      if (path === '/CMD_API_SHOW_DOMAINS') return ok('list[]=firma.pl&list[]=sklep.pl');
      if (path.startsWith('/CMD_API_DOMAIN?')) return { status: 404, body: '', insecureTlsUsed: false };
      return ok('');
    });
    const w = await prywatne.discoverDirectAdmin!('h.pl', 2222, 'u', 'p', []);
    expect(w.sites).toEqual([
      { domain: 'firma.pl', kind: 'main', ftpPath: '/domains/firma.pl/public_html' },
      { domain: 'sklep.pl', kind: 'addon', ftpPath: '/domains/sklep.pl/public_html' },
    ]);
  });
});

describe('Plesk — XML API (działa z loginem klienta, REST tylko dla administratora)', () => {
  const xmlWebspaces = `<packet><webspace><get><result><status>ok</status><filter-id>1</filter-id><id>7</id><data><gen_info><name>firma.pl</name><htype>vrt_hst</htype></gen_info></data></result></get></webspace></packet>`;
  const xmlGlowna = `<packet><site><get><result><status>ok</status><id>1</id><data><gen_info><name>firma.pl</name><webspace-id>7</webspace-id></gen_info><hosting><vrt_hst><property><name>ftp_login</name><value>firmaftp</value></property><property><name>www_root</name><value>/var/www/vhosts/firma.pl/httpdocs</value></property></vrt_hst></hosting></data></result></get></site></packet>`;
  const xmlInne = `<packet><site><get>
    <result><status>ok</status><id>2</id><data><gen_info><name>sklep.pl</name><webspace-id>7</webspace-id></gen_info><hosting><vrt_hst><property><name>www_root</name><value>/var/www/vhosts/firma.pl/sklep.pl</value></property></vrt_hst></hosting></data></result>
    <result><status>ok</status><id>3</id><data><gen_info><name>blog.firma.pl</name><webspace-id>7</webspace-id></gen_info><hosting><vrt_hst><property><name>www_root</name><value>/var/www/vhosts/firma.pl/blog.firma.pl</value></property></vrt_hst></hosting></data></result>
  </get></site></packet>`;
  const xmlBazy = `<packet><database><get-db><result><status>ok</status><id>5</id><name>wp_firma</name><type>mysql</type><webspace-id>7</webspace-id></result><result><status>ok</status><id>6</id><name>stara</name><type>mssql</type><webspace-id>7</webspace-id></result></get-db></database></packet>`;

  it('strony subskrypcji z katalogiem względem katalogu subskrypcji, login FTP, bazy z przypisaniem do konta', async () => {
    const { prywatne, http } = serwis((_p, body = '') => {
      if (body.includes('<webspace>')) return ok(xmlWebspaces);
      if (body.includes('<site>') && body.includes('<name>firma.pl</name>')) return ok(xmlGlowna);
      if (body.includes('<site>')) return ok(xmlInne);
      if (body.includes('<database>')) return ok(xmlBazy);
      return ok('');
    });
    const w = await prywatne.discoverPlesk!('h.pl', 8443, 'klient', 'haslo', []);
    expect(w.sites).toEqual([
      { domain: 'firma.pl', kind: 'main', ftpPath: '/httpdocs', konto: 'firma.pl', ftpUser: 'firmaftp' },
      { domain: 'sklep.pl', kind: 'addon', ftpPath: '/sklep.pl', konto: 'firma.pl', ftpUser: undefined },
      { domain: 'blog.firma.pl', kind: 'sub', ftpPath: '/blog.firma.pl', konto: 'firma.pl', ftpUser: undefined },
    ]);
    expect(w.databases).toEqual([{ name: 'wp_firma', sizeMb: null, konto: 'firma.pl' }]);
    expect(w.primaryDomain).toBe('firma.pl');
    expect(w.ftpHint).toMatchObject({ username: 'firmaftp' });
    const [, , sciezka, autoryzacja, , opcje] = http.mock.calls[0]!;
    expect(sciezka).toBe('/enterprise/control/agent.php');
    expect(autoryzacja).toBe('');
    expect(opcje).toMatchObject({ method: 'POST', headers: { HTTP_AUTH_LOGIN: 'klient', HTTP_AUTH_PASSWD: 'haslo', 'Content-Type': 'text/xml' } });
  });

  it('błędne dane (errcode 1001) → czytelny komunikat logowania', async () => {
    const { prywatne } = serwis(() =>
      ok('<packet><system><status>error</status><errcode>1001</errcode><errtext>Authentication failed</errtext></system></packet>'),
    );
    await expect(prywatne.discoverPlesk!('h.pl', 8443, 'k', 'zle', [])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('katalog poza /var/www/vhosts/<subskrypcja> (Windows, inny układ) — nieznany', () => {
    expect(sciezkaFtpPleska('C:\\\\Inetpub\\\\vhosts\\\\firma.pl\\\\httpdocs', 'firma.pl')).toBeNull();
    expect(sciezkaFtpPleska('/var/www/vhosts/firma.pl/httpdocs/', 'firma.pl')).toBe('/httpdocs');
    expect(sciezkaFtpPleska('/var/www/vhosts/firma.plx/httpdocs', 'firma.pl')).toBeNull();
  });
});
