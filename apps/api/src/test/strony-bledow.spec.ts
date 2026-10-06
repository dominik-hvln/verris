import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Próba bety 06.10 — d3.hvln.pl/nieistniejacy-plik pokazywał domyślną stronę 404 serwera z nazwą producenta.
 * Pierwsza poprawka wpisała ErrorDocument do httpd-includes.conf i meldowała [OK], ale LiteSpeed Enterprise
 * nie stosuje go w vhostach DA (t1, 06.10). Teraz ErrorDocument idzie do globalnego tokenu vhostów
 * cust_httpd.CUSTOM.4.pre + rewrite_confs, a [OK] dopiero po zapytaniu serwera o nieistniejącą ścieżkę.
 * Atrapy: `build rewrite_confs` „generuje” vhost z szablonu, `curl` odpowiada jak LiteSpeed — stronę Verris
 * daje tylko, gdy ErrorDocument jest w wygenerowanym vhoście (globalny jest ignorowany).
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const PROFIL = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-hosting-profile.sh'), 'utf8');
const FRAGMENT = PROFIL.slice(
  PROFIL.indexOf('verris_error_html() {'),
  PROFIL.indexOf('# -----------------------------------------------------------------------------\n# Strona zawieszonego konta'),
);

function wezel(opcje: { budowaDziala?: boolean; domeny?: string } = {}) {
  const { budowaDziala = true, domeny = 'd3.hvln.pl\ntest2.d3.hvln.pl\n' } = opcje;
  const k = mkdtempSync(join(tmpdir(), 'bledy-'));
  for (const d of ['extra', 'custom', 'cb', 'bin', 'users/admin']) mkdirSync(join(k, d), { recursive: true });
  writeFileSync(join(k, 'users/admin/domains.list'), domeny);
  // Vhosty DA są przypięte do IP konta — t1 06.10: zapytanie na 127.0.0.1 dostawało 404 domyślnego vhosta serwera.
  writeFileSync(join(k, 'users/admin/user.conf'), 'usertype=user\nip=2.28.204.249\n');
  // Stan po A3 (CacheRoot) i po pierwszej wersji (ErrorDocument w pliku globalnym) — cudza treść musi zostać.
  writeFileSync(
    join(k, 'extra/httpd-includes.conf'),
    '\n# verris-lscache (A3)\n<IfModule Litespeed>\n  CacheRoot /home/lscache\n</IfModule>\n' +
      '# >>> verris-bledy (node-hosting-profile.sh) - stary blok\nErrorDocument 404 /verris-bledy/404.html\n# <<< verris-bledy\n',
  );
  writeFileSync(join(k, 'custom/cust_httpd.CUSTOM.4.pre'), '# admin: wlasny CUSTOM4\nHeader set X-Admin tak\n');
  writeFileSync(join(k, 'lswsctrl'), `#!/usr/bin/env bash\necho "lswsctrl $*" >> "${k}/lsws.log"\n`);
  writeFileSync(
    join(k, 'cb/build'),
    `#!/usr/bin/env bash\necho "build $* ($PWD)" >> "${k}/build.log"\n` +
      (budowaDziala ? `cp "${k}/custom/cust_httpd.CUSTOM.4.pre" "${k}/vhost.conf"\n` : 'exit 1\n'),
  );
  writeFileSync(
    join(k, 'bin/curl'),
    `#!/usr/bin/env bash\necho "curl $*" >> "${k}/curl.log"\n` +
      `if [[ "$*" == *':443:2.28.204.249 '* ]] && grep -qx 'ErrorDocument 404 /verris-bledy/404.html' "${k}/vhost.conf" 2>/dev/null; then cat "${k}/www/verris-bledy/404.html"\n` +
      `else echo '<html><body><h1>404 Not Found</h1>Proudly powered by LiteSpeed Web Server</body></html>'; fi\nprintf '\\n404'\n`,
  );
  for (const p of ['lswsctrl', 'cb/build', 'bin/curl']) chmodSync(join(k, p), 0o755);
  const przebieg = () => {
    const r = spawnSync(
      'bash',
      ['-c', `set -Eeuo pipefail\nlog_ok() { echo "[OK] $*"; }\nlog_skip() { echo "[SKIP] $*"; }\nlog_info() { echo "[INFO] $*"; }\nlog_warn() { echo "[WARN] $*"; }\nlog_fail() { echo "[FAIL] $*"; }\nDRY_RUN=0\nPREFLIGHT_ONLY=0\n${FRAGMENT}\nconfigure_error_pages`],
      {
        encoding: 'utf8',
        env: {
          PATH: `${join(k, 'bin')}:${process.env.PATH}`,
          VERRIS_ERR_INC: join(k, 'extra/httpd-includes.conf'),
          VERRIS_ERR_VHOST: join(k, 'custom/cust_httpd.CUSTOM.4.pre'),
          VERRIS_ERR_DIR: join(k, 'www/verris-bledy'),
          VERRIS_LSWSCTRL: join(k, 'lswsctrl'),
          VERRIS_CB_BUILD: join(k, 'cb/build'),
          VERRIS_DA_USERS: join(k, 'users'),
          VERRIS_ERR_WAIT: '0',
        },
      },
    );
    return { wyjscie: r.stdout + r.stderr, kod: r.status };
  };
  const czytaj = (p: string) => (existsSync(join(k, p)) ? readFileSync(join(k, p), 'utf8') : '');
  return { k, przebieg, czytaj };
}

describe('Profil węzła — strony błędów serwera WWW bez nazwy producenta', () => {
  it('ErrorDocument w tokenie vhostów (nie w pliku globalnym), rewrite_confs, [OK] po realnym 404 ze stroną Verris', () => {
    const w = wezel();
    const { wyjscie, kod } = w.przebieg();
    expect(kod).toBe(0);
    const inc = w.czytaj('extra/httpd-includes.conf');
    expect(inc).toContain('CacheRoot /home/lscache');
    expect(inc).toContain(`Alias /verris-bledy/ "${join(w.k, 'www/verris-bledy')}/"`);
    expect(inc).not.toContain('ErrorDocument');
    const vh = w.czytaj('custom/cust_httpd.CUSTOM.4.pre');
    expect(vh).toContain('Header set X-Admin tak');
    for (const c of ['403', '404', '500', '503']) {
      expect(vh).toContain(`\nErrorDocument ${c} /verris-bledy/${c}.html\n`);
      const html = w.czytaj(`www/verris-bledy/${c}.html`);
      expect(html).toContain('<html lang="pl">');
      expect(html).toContain(`<p class="kod">${c}</p>`);
      expect(html).not.toMatch(/litespeed|apache|directadmin|https?:\/\//i);
    }
    expect(w.czytaj('www/verris-bledy/404.html')).toContain('Nie znaleziono strony');
    expect(readdirSync(join(w.k, 'www/verris-bledy')).sort()).toEqual(['403.html', '404.html', '500.html', '503.html']);
    expect(w.czytaj('build.log').trim()).toBe(`build rewrite_confs (${join(w.k, 'cb')})`);
    expect(w.czytaj('lsws.log')).toBe('');
    expect(w.czytaj('curl.log')).toMatch(
      /--resolve d3\.hvln\.pl:443:2\.28\.204\.249 .*https:\/\/d3\.hvln\.pl\/verris-sprawdz-404-\d+/,
    );
    expect(wyjscie).toContain('[OK] Strony błędów Verris');
    expect(wyjscie).not.toContain('[FAIL]');
  });

  it('drugi przebieg bez zmian — bez przebudowy i restartu, bez podwójnych bloków, efekt sprawdzony znowu', () => {
    const w = wezel();
    w.przebieg();
    const inc = w.czytaj('extra/httpd-includes.conf');
    const vh = w.czytaj('custom/cust_httpd.CUSTOM.4.pre');
    const { wyjscie } = w.przebieg();
    expect(w.czytaj('extra/httpd-includes.conf')).toBe(inc);
    expect(w.czytaj('custom/cust_httpd.CUSTOM.4.pre')).toBe(vh);
    expect(inc.match(/>>> verris-bledy/g)).toHaveLength(1);
    expect(vh.match(/>>> verris-bledy/g)).toHaveLength(1);
    expect(w.czytaj('build.log').trim().split('\n')).toHaveLength(1);
    expect(w.czytaj('lsws.log')).toBe('');
    expect(w.czytaj('curl.log').trim().split('\n')).toHaveLength(2);
    expect(wyjscie).toContain('[OK] Strony błędów Verris');
  });

  it('serwer dalej pokazuje własną stronę 404 (vhosty nieprzebudowane) — [FAIL], nie [OK]', () => {
    const w = wezel({ budowaDziala: false });
    const { wyjscie, kod } = w.przebieg();
    expect(kod).toBe(0);
    expect(wyjscie).not.toContain('[OK]');
    expect(wyjscie).toContain('[WARN] Strony błędów: rewrite_confs zwrócił błąd');
    expect(wyjscie).toMatch(/\[FAIL\] Strony błędów: https:\/\/d3\.hvln\.pl\/.* kod 404 bez strony Verris/);
    expect(w.czytaj('curl.log').trim().split('\n')).toHaveLength(5);
  });

  it('brak domeny hostowanej do sprawdzenia — [WARN], nie [OK]', () => {
    const w = wezel({ domeny: '' });
    const { wyjscie } = w.przebieg();
    expect(wyjscie).not.toContain('[OK]');
    expect(wyjscie).toContain('[WARN] Strony błędów: brak domeny hostowanej');
    expect(w.czytaj('curl.log')).toBe('');
  });
});
