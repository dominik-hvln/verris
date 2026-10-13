import { spawnSync } from 'child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Przegląd produkcji 13.10 (d3.hvln.pl na t1): /wp-json/ i wpisy → 404. Instalator ustawiał ładne adresy
 * (`wp rewrite structure`), ale wp-cli nie zapisuje reguł do .htaccess bez --hard i mod_rewrite widocznego z CLI.
 * Instalator dopisuje teraz standardowy blok WordPressa — jako klient, bez podążania za dowiązaniem.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-wp-install.sh'), 'utf8');
const start = SKRYPT.indexOf('runuser -u "$WP_DA_USER" -- sh -c \'\n  f="$1/.htaccess"');
const koniec = SKRYPT.indexOf('\n', SKRYPT.indexOf("' verris \"$DOCROOT\"", start));
const FRAGMENT = SKRYPT.slice(start, koniec);

function uruchom(docroot: string) {
  // runuser -u <user> -- <polecenie…> → bez zmiany użytkownika w teście
  const skrypt = `set -u\nrunuser() { shift 3; "$@"; }\nlog() { echo "$*"; }\nWP_DA_USER=klient\nDOCROOT='${docroot}'\n${FRAGMENT}\n`;
  return spawnSync('bash', ['-c', skrypt], { encoding: 'utf8' });
}

describe('Instalator WordPressa — reguły ładnych adresów w .htaccess', () => {
  it('fragment istnieje w skrypcie', () => {
    expect(start).toBeGreaterThan(-1);
  });

  it('brak .htaccess → powstaje ze standardowym blokiem WordPressa', () => {
    const d = mkdtempSync(join(tmpdir(), 'wp-'));
    expect(uruchom(d).status).toBe(0);
    const t = readFileSync(join(d, '.htaccess'), 'utf8');
    expect(t).toContain('# BEGIN WordPress');
    expect(t).toContain('RewriteRule ^index\\.php$ - [L]');
    expect(t).toContain('RewriteRule . /index.php [L]');
    expect(t).toContain('RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]');
  });

  it('istniejący blok panelu zostaje, reguły WordPressa dopisane pod nim; drugi przebieg nic nie zmienia', () => {
    const d = mkdtempSync(join(tmpdir(), 'wp-'));
    writeFileSync(join(d, '.htaccess'), '# BEGIN Verris\nOptions -Indexes\n# END Verris\n');
    uruchom(d);
    const raz = readFileSync(join(d, '.htaccess'), 'utf8');
    expect(raz.indexOf('# BEGIN Verris')).toBe(0);
    expect(raz.indexOf('# BEGIN WordPress')).toBeGreaterThan(raz.indexOf('# END Verris'));
    uruchom(d);
    expect(readFileSync(join(d, '.htaccess'), 'utf8')).toBe(raz);
  });

  it('.htaccess jako dowiązanie → bez zapisu (cel dowiązania nietknięty)', () => {
    const d = mkdtempSync(join(tmpdir(), 'wp-'));
    const cel = join(d, 'cel.txt');
    writeFileSync(cel, 'oryginał\n');
    symlinkSync(cel, join(d, '.htaccess'));
    const r = uruchom(d);
    expect(r.stdout).toContain('WARN');
    expect(readFileSync(cel, 'utf8')).toBe('oryginał\n');
    expect(lstatSync(join(d, '.htaccess')).isSymbolicLink()).toBe(true);
    expect(existsSync(join(d, '.htaccess.verris-tmp'))).toBe(false);
  });
});
