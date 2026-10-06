import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'fs';
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

describe('node-wp-update.sh — wycofanie nieudanej aktualizacji', () => {
  const skrypt = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-wp-update.sh'), 'utf8');
  const fragment = skrypt.slice(skrypt.indexOf('osobne_strony() {'), skrypt.indexOf('# koniec funkcji wycofania'));
  const zapisz = (dom: string, wzgl: string, tresc: string) => {
    mkdirSync(join(dom, wzgl, '..'), { recursive: true });
    writeFileSync(join(dom, wzgl), tresc);
  };
  // Dom z domeną rodzica (WP + poddomena beta z własnym WP + zwykły podkatalog blog) — stan „po nieudanej aktualizacji”.
  const dom = () => {
    const d = mkdtempSync(join(tmpdir(), 'wp-rollback-'));
    const pub = 'domains/d3.hvln.pl/public_html';
    zapisz(d, `${pub}/index.php`, 'stare');
    zapisz(d, `${pub}/beta/wp-config.php`, 'beta');
    zapisz(d, `${pub}/beta/index.php`, 'beta-stare');
    zapisz(d, `${pub}/blog/index.php`, 'blog-stare');
    mkdirSync(join(d, 'backups'));
    writeFileSync(join(d, 'x.sql'), '--');
    return d;
  };
  const uruchom = (d: string, docroot: string, cmd: string) =>
    spawnSync(
      'bash',
      ['-c', `set -Eeuo pipefail\nHOME_DIR='${d}'; DOCROOT_WZGL='${docroot}'\njako_klient() { ( cd "$HOME_DIR" && "$@" ); }\n${fragment}\n${cmd}`],
      { encoding: 'utf8' },
    );

  it.each([
    ['domains/d3.hvln.pl/public_html', 'domains/d3.hvln.pl/public_html.verris-nieudana'],
    ['domains/test2.d3.hvln.pl/public_html', 'domains/test2.d3.hvln.pl/public_html.verris-nieudana'],
    ['domains/d3.hvln.pl/public_html/beta', 'domains/d3.hvln.pl/beta.verris-nieudana'],
  ])('nieudana wersja %s → %s (poza katalogiem WWW)', (docroot, oczekiwana) => {
    const r = uruchom('/h', docroot, `nazwa_nieudanej '${docroot}'`);
    expect(r.stdout.trim()).toBe(oczekiwana);
    expect(oczekiwana).not.toContain('/public_html/');
  });

  it('osobne_strony wykrywa tylko podkatalogi z własnym wp-config.php', () => {
    const d = dom();
    const r = uruchom(d, 'domains/d3.hvln.pl/public_html', 'osobne_strony');
    expect(r.stdout.trim().split('\n')).toEqual(['domains/d3.hvln.pl/public_html/beta']);
  });

  it('wycofanie rodzica: pliki rodzica wracają z kopii, poddomena zostaje, nic nie trafia do public_html', () => {
    const d = dom();
    const pub = 'domains/d3.hvln.pl/public_html';
    const r = uruchom(
      d,
      pub,
      `mapfile -t O < <(osobne_strony)
       pakuj_strone "$HOME_DIR/backups/k.tar.gz" "x.sql" "\${O[@]}"
       # „po aktualizacji”: rodzic zepsuty, poddomena zmieniona po kopii
       echo zepsute > "$HOME_DIR/${pub}/index.php"; echo beta-nowe > "$HOME_DIR/${pub}/beta/index.php"
       N="$(nazwa_nieudanej '${pub}')"
       odloz_nieudana '${pub}' "$N" "\${O[@]}"
       tar -xzf "$HOME_DIR/backups/k.tar.gz" -C "$HOME_DIR" -- '${pub}'
       echo "$N"`,
    );
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('domains/d3.hvln.pl/public_html.verris-nieudana');
    const czytaj = (w: string) => readFileSync(join(d, w), 'utf8').trim();
    expect(czytaj(`${pub}/index.php`)).toBe('stare');
    expect(czytaj(`${pub}/blog/index.php`)).toBe('blog-stare');
    expect(czytaj(`${pub}/beta/index.php`)).toBe('beta-nowe'); // poddomena nie cofnięta
    expect(czytaj(`${r.stdout.trim()}/index.php`)).toBe('zepsute');
    expect(existsSync(join(d, `${pub}/beta/wp-config.php`))).toBe(true);
    expect(existsSync(join(d, `${r.stdout.trim()}/beta`))).toBe(false);
  });

  it('wycofanie poddomeny: nieudana kopia obok public_html rodzica, nie w nim', () => {
    const d = dom();
    const sub = 'domains/d3.hvln.pl/public_html/beta';
    const r = uruchom(
      d,
      sub,
      `pakuj_strone "$HOME_DIR/backups/k.tar.gz" "x.sql"
       echo zepsute > "$HOME_DIR/${sub}/index.php"
       N="$(nazwa_nieudanej '${sub}')"
       odloz_nieudana '${sub}' "$N"
       tar -xzf "$HOME_DIR/backups/k.tar.gz" -C "$HOME_DIR" -- '${sub}'
       echo "$N"`,
    );
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('domains/d3.hvln.pl/beta.verris-nieudana');
    expect(readFileSync(join(d, sub, 'index.php'), 'utf8').trim()).toBe('beta-stare');
    expect(readFileSync(join(d, 'domains/d3.hvln.pl/beta.verris-nieudana/index.php'), 'utf8').trim()).toBe('zepsute');
    expect(existsSync(join(d, 'domains/d3.hvln.pl/public_html/beta.verris-nieudana'))).toBe(false);
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
