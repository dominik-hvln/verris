import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Noc 15.10 (przegląd node-root-files): instalatory WordPressa i aplikacji sprawdzały katalog domeny raz
 * (realpath / bez_dowiazan), potem przez minuty wołały klienta (`su -l`), a na końcu ROOT robił na tej samej ścieżce
 * `chown -R`, `rm -rf` i `cp -a` (kopia i wycofanie, usunięcie strony domyślnej). Klient w tym czasie może podmienić
 * katalog pośredni (`domains/<domena>`) na dowiązanie do katalogu innego konta — root zmieniłby właściciela albo
 * skasował cudze pliki. Teraz każdy zapis w katalogu klienta robi klient (su/runuser), więc dowiązanie do cudzego
 * katalogu kończy się odmową uprawnień, a `chown -R` roota nie ma wcale.
 */
const OPS = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts');
const skrypt = (n: string) => readFileSync(join(OPS, n), 'utf8');

/** Linie, w których root (poza su/runuser/run_as/wp_as_user) zapisuje w katalogu klienta. */
function zapisyRoota(tresc: string): string[] {
  const zle: string[] = [];
  for (const linia of tresc.split('\n')) {
    const l = linia.trim();
    if (l.startsWith('#')) continue;
    const zapis =
      /(^|[;&|({]\s*|\bthen\s+|\bif\s+|!\s*)(rm|cp|chown|chmod|mv|install|tar)\s[^\n]*"\$\{?(DOCROOT|KOPIA)\b/.test(l) ||
      /\bfind\s+"\$\{?DOCROOT\b[^\n]*(-delete|-exec\s+rm)/.test(l) ||
      /\bchown\s+-R\b/.test(l);
    if (!zapis) continue;
    if (/\bjako_klient\s|\brunuser\s+-u\b|^\s*run_as\s|^\s*wp_as_user\s/.test(l)) continue;
    zle.push(l);
  }
  return zle;
}

describe('instalatory na węźle — zapis w katalogu klienta tylko jako klient', () => {
  it.each(['node-app-install.sh', 'node-wp-install.sh'])('%s: bez zapisu roota na ścieżce klienta i bez chown -R', (n) => {
    expect(zapisyRoota(skrypt(n))).toEqual([]);
  });

  it('strażnik łapie stary wzorzec (kontrola samego testu)', () => {
    expect(zapisyRoota('fixperms() { chown -R "${APP_DA_USER}:${APP_DA_USER}" "$DOCROOT" 2>/dev/null || true; }')).toHaveLength(1);
    expect(zapisyRoota('  if find "$DOCROOT" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && cp -a -- "$KOPIA/." "$DOCROOT/"; then')).toHaveLength(1);
    expect(zapisyRoota('  rm -f -- "$DOCROOT/index.html"')).toHaveLength(1);
    expect(zapisyRoota('  jako_klient rm -f -- "$DOCROOT/index.html"')).toEqual([]);
  });

  it('node-wp-install.sh: locale i login konta sprawdzane w skrypcie, nie tylko w API', () => {
    const s = skrypt('node-wp-install.sh');
    const r = (env: Record<string, string>) =>
      spawnSync('bash', ['-c', `${s.slice(0, s.indexOf('katalog_strony() {'))}\necho DALEJ`], {
        env: { PATH: process.env.PATH ?? '', WP_DA_USER: 'u1', WP_DOMAIN: 'a.pl', WP_DB_NAME: 'd', WP_DB_USER: 'd', WP_DB_PASS: 'p', WP_ADMIN_USER: 'a', WP_ADMIN_PASS: 'p', WP_ADMIN_EMAIL: 'a@a.pl', ...env },
        encoding: 'utf8',
      }).stdout;
    expect(r({})).toContain('DALEJ');
    expect(r({ WP_LOCALE: 'en_US' })).toContain('DALEJ');
    expect(r({ WP_LOCALE: "pl_PL' --exec='x" })).not.toContain('DALEJ');
    expect(r({ WP_DA_USER: '../root' })).not.toContain('DALEJ');
  });

  // Instalator aplikacji uruchomiony od kontroli katalogu do końca (wycofanie i usunięcie strony domyślnej)
  // z atrapą `su`, która zapisuje polecenia wykonane jako klient.
  const app = skrypt('node-app-install.sh');
  function uruchom(poZmianach: string, rmZawodzi = false) {
    const root = mkdtempSync(join(tmpdir(), 'konta-klient-'));
    const d = join(root, 'u1', 'domains', 'x.pl', 'public_html');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'index.html'), '<title>x — hosting verris</title>');
    mkdirSync(join(d, 'assets'));
    writeFileSync(join(d, 'assets', 'verris-logo.svg'), '<svg/>');
    const bin = join(root, 'bin');
    mkdirSync(bin);
    const suLog = join(root, 'su.log');
    // su -s /bin/bash -l <user> -c <polecenie>
    writeFileSync(
      join(bin, 'su'),
      `#!/bin/bash\nwhile [ "$#" -gt 0 ] && [ "$1" != "-c" ]; do shift; done\nprintf '%s\\n' "$2" >> "${suLog}"\n` +
        (rmZawodzi ? 'case "$2" in rm\\ -f*) exit 1 ;; esac\n' : '') +
        'exec bash -c "$2"\n',
    );
    chmodSync(join(bin, 'su'), 0o755);
    const start = app.indexOf('DOMYSLNA=0');
    const koniec = app.indexOf('trap wycofaj EXIT') + 'trap wycofaj EXIT'.length;
    const fragment = app.slice(start, koniec).replaceAll('/home/${APP_DA_USER}/', `${root}/u1/`);
    const funkcja = (nazwa: string) => {
      const i = app.indexOf(`${nazwa}() {`);
      return app.slice(i, app.indexOf('\n}\n', i) + 3);
    };
    const bezZmian = app.split('\n').find((l) => l.startsWith('bez_zmian() {')) ?? '';
    const r = spawnSync(
      'bash',
      ['-c', `set -Eeuo pipefail\nlog() { echo "[app-install] $*"; }\n${bezZmian}\nAPP_DA_USER=u1\nDOCROOT=${JSON.stringify(d)}\n${fragment}\n${funkcja('usun_strone_domyslna')}\n${poZmianach}`],
      { encoding: 'utf8', env: { PATH: `${bin}:${process.env.PATH ?? ''}`, HOME: root } },
    );
    return { r, d, root, su: existsSync(suLog) ? readFileSync(suLog, 'utf8') : '' };
  }

  it('nieudana instalacja: kopia, wycofanie i sprzątanie kopii idą przez klienta; katalog wraca 1:1', () => {
    const { r, d, su } = uruchom('echo x > "$DOCROOT/index.php"; rm -rf "$DOCROOT/assets"; false');
    expect(r.status).not.toBe(0);
    expect(readdirSync(d).sort()).toEqual(['assets', 'index.html']);
    expect(r.stdout).toContain('[VERRIS_APP] bez_zmian=1');
    expect(su).toMatch(/cp -a -- .*public_html\/\. /); // kopia
    expect(su).toMatch(/find .*public_html -mindepth 1 -maxdepth 1 -exec rm -rf -- \\?\{\\?\} \+/); // wyczyszczenie (printf %q: \{\})
    expect(su).toMatch(/cp -a -- .*verris-app-kopia.*\/\. .*public_html\//); // przywrócenie
  });

  it('udana instalacja: strona domyślna usuwana przez klienta, kopia sprzątnięta, bez chown roota', () => {
    const { r, d, root, su } = uruchom('echo x > "$DOCROOT/index.php"; usun_strone_domyslna');
    expect(r.status).toBe(0);
    expect(readdirSync(d)).toEqual(['index.php']);
    expect(su).toMatch(/rm -f -- .*public_html\/index\.html/);
    expect(su).toMatch(/rm -rf -- .*public_html\/assets/);
    expect(readdirSync(join(root, 'u1')).filter((n) => n.startsWith('.verris-app-kopia'))).toEqual([]);
  });

  it('udana instalacja, a usunięcie strony domyślnej się nie udało: ostrzeżenie, bez wycofania aplikacji', () => {
    const { r, d } = uruchom('echo x > "$DOCROOT/index.php"; usun_strone_domyslna', true);
    expect(r.status).toBe(0);
    expect(readdirSync(d)).toContain('index.php');
    expect(r.stdout).not.toContain('bez_zmian=1');
    expect(r.stdout).toContain('UWAGA: nie udało się usunąć domyślnej strony');
  });
});
