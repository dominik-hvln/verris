import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Próba bety 06.10 — d3.hvln.pl/nieistniejacy-plik pokazywał domyślną stronę 404 serwera z nazwą producenta.
 * Profil węzła kładzie strony błędów Verris we wspólnym katalogu i ErrorDocument w httpd-includes.conf
 * (pliku, którego CustomBuild nie nadpisuje). Uruchamiamy prawdziwy fragment skryptu z atrapą lswsctrl.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const PROFIL = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-hosting-profile.sh'), 'utf8');
const FRAGMENT = PROFIL.slice(
  PROFIL.indexOf('verris_error_html() {'),
  PROFIL.indexOf('# -----------------------------------------------------------------------------\n# Strona zawieszonego konta'),
);

function wezel() {
  const k = mkdtempSync(join(tmpdir(), 'bledy-'));
  mkdirSync(join(k, 'extra'));
  // Stan po A3 (CacheRoot) — cudza treść pliku musi zostać.
  writeFileSync(join(k, 'extra/httpd-includes.conf'), '\n# verris-lscache (A3)\n<IfModule Litespeed>\n  CacheRoot /home/lscache\n</IfModule>\n');
  writeFileSync(join(k, 'lswsctrl'), `#!/usr/bin/env bash\necho "lswsctrl $*" >> "${k}/lsws.log"\n`);
  chmodSync(join(k, 'lswsctrl'), 0o755);
  const przebieg = () => {
    const r = spawnSync(
      'bash',
      ['-c', `set -Eeuo pipefail\nlog_ok() { echo "[OK] $*"; }\nlog_skip() { echo "[SKIP] $*"; }\nlog_info() { echo "[INFO] $*"; }\nlog_warn() { echo "[WARN] $*"; }\nlog_fail() { echo "[FAIL] $*"; }\nDRY_RUN=0\nPREFLIGHT_ONLY=0\n${FRAGMENT}\nconfigure_error_pages`],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          VERRIS_ERR_INC: join(k, 'extra/httpd-includes.conf'),
          VERRIS_ERR_DIR: join(k, 'www/verris-bledy'),
          VERRIS_LSWSCTRL: join(k, 'lswsctrl'),
        },
      },
    );
    return { wyjscie: r.stdout + r.stderr, kod: r.status };
  };
  const czytaj = (p: string) => (existsSync(join(k, p)) ? readFileSync(join(k, p), 'utf8') : '');
  return { k, przebieg, czytaj };
}

describe('Profil węzła — strony błędów serwera WWW bez nazwy producenta', () => {
  it('ErrorDocument ze ścieżką lokalną (kod błędu zostaje) + Alias do stron po polsku, restart LiteSpeed', () => {
    const w = wezel();
    const { wyjscie, kod } = w.przebieg();
    expect(kod).toBe(0);
    const inc = w.czytaj('extra/httpd-includes.conf');
    expect(inc).toContain('CacheRoot /home/lscache');
    expect(inc).toContain(`Alias /verris-bledy/ "${join(w.k, 'www/verris-bledy')}/"`);
    for (const c of ['403', '404', '500', '503']) {
      expect(inc).toContain(`\nErrorDocument ${c} /verris-bledy/${c}.html\n`);
      const html = w.czytaj(`www/verris-bledy/${c}.html`);
      expect(html).toContain('<html lang="pl">');
      expect(html).toContain(`<p class="kod">${c}</p>`);
      expect(html).not.toMatch(/litespeed|apache|directadmin|https?:\/\//i);
    }
    expect(w.czytaj('www/verris-bledy/404.html')).toContain('Nie znaleziono strony');
    expect(readdirSync(join(w.k, 'www/verris-bledy')).sort()).toEqual(['403.html', '404.html', '500.html', '503.html']);
    expect(w.czytaj('lsws.log').trim()).toBe('lswsctrl restart');
    expect(wyjscie).toContain('[OK] Strony błędów Verris');
  });

  it('drugi przebieg bez zmian — bez restartu i bez podwójnego bloku', () => {
    const w = wezel();
    w.przebieg();
    const przed = w.czytaj('extra/httpd-includes.conf');
    const { wyjscie } = w.przebieg();
    expect(w.czytaj('extra/httpd-includes.conf')).toBe(przed);
    expect(przed.match(/>>> verris-bledy/g)).toHaveLength(1);
    expect(w.czytaj('lsws.log').trim().split('\n')).toEqual(['lswsctrl restart']);
    expect(wyjscie).toContain('[OK] Strony błędów Verris');
  });
});
