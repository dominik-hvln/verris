import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DirectAdminService } from '../servers/directadmin.service.js';

/**
 * Próba bety 06.10 — WordPress na poddomenie (beta.d3.hvln.pl, u klienta sklep.firma.pl).
 * Skrypty na węźle same znajdują katalog poddomeny w układzie DirectAdmina, a API przyjmuje
 * tylko poddomeny, które DA zna dla domeny konta.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const funkcje = (plik: string) => {
  const s = readFileSync(join(KORZEN, 'ops', 'scripts', plik), 'utf8');
  return s.slice(s.indexOf('katalog_strony() {'), s.indexOf('\n}\n', s.indexOf('bez_dowiazan() {')) + 3);
};

describe.each(['node-wp-install.sh', 'node-wp-update.sh'])('%s — katalog strony', (plik) => {
  const dom = mkdtempSync(join(tmpdir(), 'wp-home-'));
  mkdirSync(join(dom, 'domains/d3.hvln.pl/public_html/beta'), { recursive: true });
  mkdirSync(join(dom, 'domains/test2.d3.hvln.pl/public_html'), { recursive: true });
  mkdirSync(join(dom, 'domains/zly.pl'), { recursive: true });
  symlinkSync('/etc', join(dom, 'domains/zly.pl/public_html'));
  const bash = (cmd: string) => spawnSync('bash', ['-c', `${funkcje(plik)}\n${cmd}`], { encoding: 'utf8' });

  it.each([
    ['d3.hvln.pl', 'domains/d3.hvln.pl/public_html'],
    ['test2.d3.hvln.pl', 'domains/test2.d3.hvln.pl/public_html'],
    ['beta.d3.hvln.pl', 'domains/d3.hvln.pl/public_html/beta'],
  ])('%s → %s', (nazwa, oczekiwany) => {
    const r = bash(`katalog_strony '${dom}' '${nazwa}'`);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(oczekiwany);
  });

  it('nieznana poddomena → błąd', () => {
    expect(bash(`katalog_strony '${dom}' 'nie.d3.hvln.pl'`).status).toBe(1);
  });

  it('public_html będący dowiązaniem (np. do /etc) jest odrzucany', () => {
    expect(bash(`bez_dowiazan '${dom}' 'domains/zly.pl/public_html'`).status).not.toBe(0);
    expect(bash(`bez_dowiazan '${dom}' 'domains/d3.hvln.pl/public_html/beta'`).status).toBe(0);
  });
});

describe('API — strona konta: domena albo poddomena znana DirectAdminowi', () => {
  const da = Object.create(DirectAdminService.prototype) as DirectAdminService & Record<string, unknown>;
  const pytania: string[] = [];
  Object.assign(da, {
    listHostingDomainsForSubscription: async () => ({ domains: [{ name: 'd3.hvln.pl' }, { name: 'test2.d3.hvln.pl' }], fetchError: null }),
    daGetForSubscription: async (_s: string, _u: string, cmd: string, q: { domain: string }) => {
      pytania.push(`${cmd} ${q.domain}`);
      return new URLSearchParams(q.domain === 'd3.hvln.pl' ? 'list[]=beta&list[]=staging' : '');
    },
  });

  it('domena konta bez pytania DA o poddomeny', async () => {
    pytania.length = 0;
    await expect(da.witrynaKonta('s', 'u', 'Test2.d3.hvln.pl')).resolves.toEqual({ nazwa: 'test2.d3.hvln.pl', domena: 'test2.d3.hvln.pl', sub: null });
    expect(pytania).toEqual([]);
  });

  it('poddomena z listy DA → katalog domeny nadrzędnej', async () => {
    await expect(da.witrynaKonta('s', 'u', 'beta.d3.hvln.pl')).resolves.toEqual({ nazwa: 'beta.d3.hvln.pl', domena: 'd3.hvln.pl', sub: 'beta' });
  });

  it.each(['obca.d3.hvln.pl', 'a.beta.d3.hvln.pl', 'cudza.pl'])('%s → odmowa', async (n) => {
    await expect(da.witrynaKonta('s', 'u', n)).rejects.toThrow('Domena nie należy do tej usługi.');
  });
});

describe('Instalator WordPressa — bezpieczne ustawienia od razu', () => {
  it('wyłącza edytor plików w kokpicie przed zgłoszeniem sukcesu (I-08; próba bety 06.10)', () => {
    const s = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-wp-install.sh'), 'utf8');
    const edytor = s.indexOf('config set DISALLOW_FILE_EDIT true --raw');
    expect(edytor).toBeGreaterThan(s.indexOf('core install'));
    expect(edytor).toBeLessThan(s.indexOf('status=installed'));
  });
});
