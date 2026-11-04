import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * P2-06 (decyzja 13, 3.11.2026) — „Dograj różnice” przed przełączeniem DNS dosyłało pliki i pocztę, ale nie bazę:
 * zamówienia złożone w starym sklepie między pierwszą kopią a zmianą DNS nie trafiały do nowego. MYSQL_DELTA:
 * tryb konserwacji na starej stronie (WordPress), zrzut do pliku, kopia bazy docelowej, import, komplet tabel;
 * każdy błąd = baza docelowa w stanie sprzed dosynchronizowania i sklep z powrotem otwarty u starego dostawcy.
 * Na prawdziwych funkcjach workera (bash), z atrapami mysql/mysqldump/lftp/curl.
 */
const SKRYPTY = resolve(import.meta.dirname, '..', '..', '..', '..', 'ops/scripts');
const WORKER = join(SKRYPTY, 'node-migration-worker.sh');
const zrodlo = readFileSync(WORKER, 'utf8');

function wytnij(od: string, do_: string) {
  const a = zrodlo.indexOf(od);
  const b = zrodlo.indexOf(do_, a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return zrodlo.slice(a, b);
}
const funkcja = (nazwa: string) => wytnij(`${nazwa}() {`, '\n}\n') + '\n}\n';

const ZRZUT = 'CREATE TABLE `wp_posts` (id int);\nINSERT INTO `wp_posts` VALUES (1);\nCREATE TABLE `wp_wc_orders` (id int);\n-- Dump completed on 2026-11-03\n';

interface Opcje {
  wordpress?: boolean;
  zrzutBlad?: boolean;
  zrzut?: string;
  kopiaBlad?: boolean;
  importBlad?: boolean;
  tabeleWBazie?: string[];
  kodStrony?: string;
  bezPlikow?: boolean;
}

function uruchom(o: Opcje = {}) {
  const kat = mkdtempSync(join(tmpdir(), 'verris-delta-'));
  const bin = join(kat, 'bin');
  const strona = join(kat, 'home', 'konto', 'domains', 'sklep.pl', 'public_html');
  mkdirSync(bin);
  mkdirSync(strona, { recursive: true });
  if (o.wordpress !== false) writeFileSync(join(strona, 'wp-settings.php'), '<?php // WordPress');
  const atrapa = (nazwa: string, tresc: string) => {
    writeFileSync(join(bin, nazwa), `#!/bin/bash\n${tresc}\n`);
    chmodSync(join(bin, nazwa), 0o755);
  };
  // runuser -u U -- polecenie… → polecenie… (test działa jako jeden użytkownik)
  atrapa('runuser', 'while [ "$1" != "--" ]; do shift; done; shift; exec "$@"');
  atrapa('getent', 'echo "93.184.216.34 STREAM x"');
  atrapa('sleep', ':');
  atrapa('ip', ':');
  // lftp: zapisuje polecenia; „put X -o Y” kopiuje treść wgrywanego pliku (podgląd .maintenance na „starej stronie”).
  atrapa('lftp', `while [ "$1" != "-e" ]; do shift; done; cmd="$2"; echo "$cmd" >> "${kat}/lftp"
if [[ "$cmd" == *"put '"* ]]; then src="\${cmd#*put \\'}"; src="\${src%%\\'*}"; cp "$src" "${kat}/maintenance-na-zrodle"; fi`);
  atrapa('curl', `printf '%s' "${o.kodStrony ?? '503'}"`);
  // mysqldump = kopia bazy docelowej (stan po pierwszej migracji)
  atrapa('mysqldump', o.kopiaBlad ? 'exit 2' : 'printf "CREATE TABLE \\`wp_posts\\` (id int);\\nCREATE DEFINER=\\`vmig_1\\`@\\`localhost\\` VIEW v AS SELECT 1;\\n-- KOPIA-STARA\\n-- Dump completed on 2026-11-03\\n"');
  // mysql: import (stdin z „-u”) zapisuje treść kolejnych importów; zapytania -N -e zwracają tabele bazy docelowej.
  atrapa('mysql', `if [[ " $* " == *" -N -e "* ]]; then
  case "$*" in *"COUNT(*)"*) echo 2 ;; *) printf '%s\\n' ${(o.tabeleWBazie ?? ['wp_posts', 'wp_wc_orders']).join(' ')} ;; esac; exit 0; fi
if [[ " $* " == *" -u "* ]]; then n=$(ls "${kat}"/import.* 2>/dev/null | wc -l); cat > "${kat}/import.$n"
  [ "${o.importBlad ? '1' : ''}" = 1 ] && [ "$n" = 0 ] && exit 1; exit 0; fi
cat >/dev/null; exit 0`);

  const atrapy = [
    `. "${join(SKRYPTY, 'lib/migration-input-guard.sh')}"`,
    `MIG_HOME="${kat}/mig"; MIG_USER=verris-mig; VERRIS_MIG_KOPIE_DIR="${kat}/kopie"; mkdir -p "$MIG_HOME/stage/konto"`,
    `install() { mkdir -p "\${@: -1}"; }`,
    'ensure_mig_user() { :; }',
    `katalog_sekretow() { mktemp -d "${kat}/sek.XXXX"; }`,
    'plik_sekretu() { ( umask 077; printf "%s" "$3" > "$1/$2" ); echo "$1/$2"; }',
    'chown() { :; }',
    'jako_mig() { "$@"; }',
    'jako_mig_env() { local v="$1" f="$2"; shift 2; export "$v=$(cat "$f")"; "$@"; }',
    'pin_host() { echo 93.184.216.34; }',
    'mysql_sandbox_opt() { :; }',
    'mysql_row_total() { echo 7; }',
    `docroot_for() { echo "${kat}/home/$1/domains/$2/public_html"; }`,
    'mysql_prepare_target_db() { echo konto_sklep; }',
    // run_mysql w trybie MIG_ZRZUT_DO: trzy drogi pobrania sprawdzają osobne testy; tu — zrzut gotowy albo błąd.
    `run_mysql() { [ -n "\${MIG_ZRZUT_DO:-}" ] || return 99; ${o.zrzutBlad ? 'return 3' : `printf '%s' "$ZRZUT" > "$MIG_ZRZUT_DO"; echo 1`}; }`,
    funkcja('oczysc_zrzut'),
    funkcja('w_nawiasach'),
    funkcja('lftp_url'),
    wytnij('MIG_KOPIE_DIR="${VERRIS_MIG_KOPIE_DIR', 'run_imap() {'),
  ].join('\n');
  const job = JSON.stringify({
    id: 'j1',
    kind: 'MYSQL_DELTA',
    target: { accountUsername: 'konto', domain: 'sklep.pl' },
    source: { host: '93.184.216.34', port: 3306, database: 'sklep', username: 'u', password: 'p' },
    targetDb: { database: 'konto_sklep', username: 'konto_user', password: 'tajne' },
    ...(o.bezPlikow ? {} : { ftpFallback: { protocol: 'sftp', host: '93.184.216.34', port: 22, username: 'ftpu', password: 'ftpp', remotePath: '/public_html' } }),
    sourceDomain: 'sklep.pl',
    konserwacja: { minuty: 120 },
    delta: true,
  });
  writeFileSync(join(kat, 't.sh'), `set -uo pipefail\n${atrapy}\nrun_mysql_delta "$JOB" "${kat}/log"\n`);
  let rc = 0;
  let out: string;
  try {
    out = execFileSync('bash', [join(kat, 't.sh')], {
      stdio: 'pipe',
      env: { ...process.env, JOB: job, ZRZUT: o.zrzut ?? ZRZUT, PATH: `${bin}:${process.env.PATH}`, VERRIS_MIG_KONSERWACJA_ODCZEKAJ: '0' },
    }).toString();
  } catch (e) {
    rc = (e as { status: number }).status;
    out = String((e as { stdout?: Buffer }).stdout ?? '');
  }
  const czytaj = (n: string) => (existsSync(join(kat, n)) ? readFileSync(join(kat, n), 'utf8') : '');
  return {
    rc,
    out,
    log: czytaj('log'),
    lftp: czytaj('lftp'),
    importy: [0, 1, 2].map((n) => czytaj(`import.${n}`)).filter(Boolean),
    integrity: existsSync(join(kat, 'log.integrity')) ? JSON.parse(czytaj('log.integrity')) : null,
    maintenance: czytaj('maintenance-na-zrodle'),
  };
}

describe('P2-06 — ostatnie dosynchronizowanie bazy przed przełączeniem DNS (MYSQL_DELTA)', () => {
  it('WordPress: tryb konserwacji na starej stronie, świeży zrzut w bazie docelowej, konserwacja zostaje do końca okna', () => {
    const r = uruchom();
    expect(r.rc, r.log).toBe(0);
    expect(r.importy).toEqual([ZRZUT]);
    expect(r.lftp).toContain("-o '/public_html/.maintenance'");
    expect(r.lftp).not.toMatch(/\brm '/);
    // WordPress: konserwacja trwa, dopóki time() − $upgrading < 600 s → okno 120 min = mtime + 6600 s.
    expect(r.maintenance).toContain('$upgrading = @filemtime(__FILE__) + 6600;');
    expect(r.integrity).toMatchObject({ kind: 'mysql', delta: true, database: 'konto_sklep', konserwacja: 'wlaczona' });
    expect(Date.parse(r.integrity.konserwacjaDo)).toBeGreaterThan(Date.now() + 110 * 60_000);
    // Do panelu klienta nie idą ścieżki węzła ani hasła.
    expect(JSON.stringify(r.integrity)).not.toMatch(/kopie|\/var\/|tajne/);
    expect(r.log).not.toContain('tajne');
  });

  it('zrzut źródła się nie udał — baza docelowa nietknięta, konserwacja zdjęta, krok kończy się błędem', () => {
    const r = uruchom({ zrzutBlad: true });
    expect(r.rc).toBe(3);
    expect(r.importy).toEqual([]);
    expect(r.lftp).toContain("rm '/public_html/.maintenance'");
    expect(r.log).toContain('baza docelowa bez zmian');
  });

  it('urwany zrzut (bez znacznika końca) — nie trafia do bazy docelowej', () => {
    const r = uruchom({ zrzut: 'CREATE TABLE `wp_posts` (id int);\nINSERT INTO `wp_po' });
    expect(r.rc).toBe(3);
    expect(r.importy).toEqual([]);
    expect(r.lftp).toContain("rm '/public_html/.maintenance'");
    expect(r.log).toContain('niekompletny');
  });

  it('eksport przez PHP (znacznik VERRIS-EXPORT-OK) też jest kompletnym zrzutem', () => {
    const r = uruchom({ zrzut: 'CREATE TABLE `wp_posts` (id int);\nCREATE TABLE `wp_wc_orders` (id int);\nSET FOREIGN_KEY_CHECKS=1;\n-- VERRIS-EXPORT-OK\n' });
    expect(r.rc, r.log).toBe(0);
    expect(r.importy).toHaveLength(1);
  });

  it('bez kopii bazy docelowej nie nadpisujemy jej', () => {
    const r = uruchom({ kopiaBlad: true });
    expect(r.rc).toBe(3);
    expect(r.importy).toEqual([]);
    expect(r.lftp).toContain("rm '/public_html/.maintenance'");
  });

  it('import padł w połowie — baza docelowa przywrócona z kopii, sklep wraca do sprzedaży u starego dostawcy', () => {
    const r = uruchom({ importBlad: true });
    expect(r.rc).toBe(3);
    expect(r.importy).toHaveLength(2);
    expect(r.importy[0]).toBe(ZRZUT);
    expect(r.importy[1]).toContain('-- KOPIA-STARA');
    expect(r.importy[1]).toContain('CREATE  VIEW v');
    expect(r.importy[1]).not.toContain('DEFINER');
    expect(r.lftp).toContain("rm '/public_html/.maintenance'");
    expect(r.log).toContain('przywrócona z kopii');
  });

  it('po imporcie brakuje tabeli ze zrzutu — też przywrócenie kopii i błąd', () => {
    const r = uruchom({ tabeleWBazie: ['wp_posts'] });
    expect(r.rc).toBe(3);
    expect(r.log).toContain('brakuje tabel: wp_wc_orders');
    expect(r.importy[1]).toContain('-- KOPIA-STARA');
  });

  it('strona spoza WordPressa — bez pliku konserwacji, ostrzeżenie w raporcie (panel prosi o ręczne wstrzymanie sprzedaży)', () => {
    const r = uruchom({ wordpress: false });
    expect(r.rc, r.log).toBe(0);
    expect(r.lftp).toBe('');
    expect(r.integrity).toMatchObject({ konserwacja: 'niedostepna', konserwacjaDo: null });
    expect(r.log).toContain('nie jest WordPressem');
  });

  it('zlecenie bez dostępu do plików starej strony — tylko ostrzeżenie', () => {
    const r = uruchom({ bezPlikow: true });
    expect(r.rc, r.log).toBe(0);
    expect(r.integrity).toMatchObject({ konserwacja: 'niedostepna' });
  });

  it('plik konserwacji wgrany, ale strona nie odpowiada 503 (np. cache przed WordPressem) — „niepotwierdzona”', () => {
    const r = uruchom({ kodStrony: '200' });
    expect(r.rc, r.log).toBe(0);
    expect(r.integrity).toMatchObject({ konserwacja: 'niepotwierdzona' });
  });
});

describe('P2-06 — worker: pozostałe miejsca', () => {
  it('lokalna kopia plików nie przenosi .maintenance (ponowne „Dograj różnice” nie zamknie sklepu u nas)', () => {
    expect(zrodlo).toMatch(/runuser -u "\$user" -- rsync -a --delete[^\n]*--exclude '\/\.maintenance'/);
  });

  it('run_one obsługuje MYSQL_DELTA bez podbijania liczników bazy', () => {
    const blok = wytnij('    MYSQL_DELTA)', ';;');
    expect(blok).toContain('run_mysql_delta "$job" "$logfile"');
    expect(blok).toContain('complete_job "$id" 0 0 0 0 "$logfile"');
  });

  it('kopie baz docelowych sprząta systemd-tmpfiles po 14 dniach', () => {
    expect(zrodlo).toContain('d ${MIG_KOPIE_DIR} 0700 root root 14d');
  });

  it('run_mysql w trybie zrzutu do pliku nie tworzy tymczasowego użytkownika i nie importuje do bazy docelowej', () => {
    const run = wytnij('run_mysql() {', '\n}\n');
    expect(run).toContain('if [ -z "${MIG_ZRZUT_DO:-}" ] && { [ -z "$tuser" ] || [ -z "$tpass" ]; }; then');
    expect(run).toContain(`[ -n "\${MIG_ZRZUT_DO:-}" ] && importuj=(jako_mig bash -c 'cat >"$1"' _ "$MIG_ZRZUT_DO")`);
  });
});
