import { BadRequestException } from '@nestjs/common';
import { normalizujKatalogDocroot, odczytajDocroot, zapiszDocroot } from './docroot.js';
import { DirectAdminService } from './directadmin.service.js';

describe('A-06 — katalog główny domeny (Custom HTTPD)', () => {
  it.each([
    ['', ''],
    ['/public/', 'public'],
    ['public_html/app/public', 'app/public'],
    ['public_html', ''],
  ])('normalizuje %j → %j', (w, o) => expect(normalizujKatalogDocroot(w)).toBe(o));

  it.each([['../etc'], ['a/../../b'], ['.git'], ['a b'], ['a|b'], ['a/b/c/d/e'], ['x\nRewriteEngine on'], ['a/..'], ['a%2e']])(
    'odrzuca %j',
    (w) => expect(() => normalizujKatalogDocroot(w)).toThrow(BadRequestException),
  );

  const admina = 'SetEnv FOO bar\n<IfModule x>\n</IfModule>\n';

  it('dopisuje blok, zostawia wpisy administratora i czyta go z powrotem', () => {
    const c = zapiszDocroot(admina, '/home/k1/domains/a.pl/public_html/public');
    expect(c.startsWith(admina)).toBe(true);
    expect(c).toContain('|*if !SUB|\n|?DOCROOT=/home/k1/domains/a.pl/public_html/public|\n|*endif|');
    expect(odczytajDocroot(c)).toBe('public');
  });

  it('zmiana podmienia blok (bez duplikatu), powrót do public_html usuwa go w całości', () => {
    const raz = zapiszDocroot(admina, '/home/k1/domains/a.pl/public_html/public');
    const dwa = zapiszDocroot(raz, '/home/k1/domains/a.pl/public_html/app/web');
    expect(dwa.match(/verris-docroot-start/g)).toHaveLength(1);
    expect(odczytajDocroot(dwa)).toBe('app/web');
    expect(zapiszDocroot(dwa, null)).toBe(admina);
    expect(zapiszDocroot('', null)).toBe('');
  });

  it('DOCROOT administratora poza blokiem nie jest brany za ustawienie klienta', () => {
    expect(odczytajDocroot('|?DOCROOT=/home/k1/domains/a.pl/public_html/x|')).toBe('');
  });
});

describe('DirectAdminService — A-06 docroot', () => {
  function stanowisko(o: { config?: string | null; wpisy?: unknown[] } = {}) {
    const svc = new DirectAdminService({} as never, {} as never, {} as never, { record: vi.fn() } as never);
    const post = vi.fn(async () => ({ data: 'error=0&text=ok' }));
    const get = vi.fn(async () => ({ data: o.config === null ? 'error=0' : `config=${encodeURIComponent(o.config ?? 'SetEnv A b\n')}` }));
    const listDir = vi.fn(async () => o.wpisy ?? [{ name: 'public', type: 'dir' }]);
    vi.spyOn(svc, 'assertDomainOwnedBySubscription').mockResolvedValue('a.pl');
    vi.spyOn(svc as unknown as { accountClientForSubscription: () => Promise<unknown> }, 'accountClientForSubscription').mockResolvedValue({
      account: { status: 'ACTIVE', serverId: 'n1', daUsername: 'k1' },
      client: { listDir },
    } as never);
    vi.spyOn(svc, 'getClientForServer').mockResolvedValue({ client: { get, post } } as never);
    return { svc, post, get, listDir };
  }

  it('zapis: sprawdza katalog, wysyła Custom HTTPD z zachowaniem wpisów administratora', async () => {
    const s = stanowisko();
    await expect(s.svc.setHostingDocroot('s1', 'u1', { domain: 'a.pl', katalog: 'public' })).resolves.toEqual({ domain: 'a.pl', katalog: 'public' });
    expect(s.listDir).toHaveBeenCalledWith('/domains/a.pl/public_html');
    const body = new URLSearchParams((s.post.mock.calls[0] as unknown as [string, string])[1]);
    expect(body.get('domain')).toBe('a.pl');
    expect(body.get('config')).toContain('SetEnv A b\n# verris-docroot-start');
    expect(body.get('config')).toContain('|?DOCROOT=/home/k1/domains/a.pl/public_html/public|');
  });

  it('brak katalogu albo plik zamiast katalogu → 400 bez zapisu', async () => {
    const s = stanowisko({ wpisy: [{ name: 'public', type: 'file' }] });
    await expect(s.svc.setHostingDocroot('s1', 'u1', { domain: 'a.pl', katalog: 'public' })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
  });

  it('DA nie oddał bieżącej konfiguracji → 400 bez zapisu (nie kasujemy wpisów administratora)', async () => {
    const s = stanowisko({ config: null });
    await expect(s.svc.setHostingDocroot('s1', 'u1', { domain: 'a.pl', katalog: '' })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
  });
});
