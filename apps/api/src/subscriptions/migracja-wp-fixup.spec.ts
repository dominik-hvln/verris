import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * E2e 14.10 (migracja 1e4768ef, PB-45): krok „Konfiguracja strony” padał 3/3 z „sudo: wp: command not found”.
 * `sudo` na CloudLinux/EL ma secure_path bez /usr/local/bin (tam leżą wp-cli i PHP DirectAdmina), więc
 * `sudo -u klient -- wp` nie znajdował polecenia. Do tego klient przeniósł inną bazę niż ta z wp-config.php,
 * a worker i tak wpisywał ją do wp-config.php (brał „pierwszą lepszą”) — strona łączyłaby się z cudzą bazą.
 *
 * Test uruchamia prawdziwe run_wp_fixup z workera; `sudo` udaje secure_path (PATH bez katalogu z wp/php).
 */
const WORKER = resolve(import.meta.dirname, '..', '..', '..', '..', 'ops/scripts/node-migration-worker.sh');
const zrodlo = readFileSync(WORKER, 'utf8');

function funkcja(nazwa: string) {
  const od = zrodlo.indexOf(`\n${nazwa}() {`);
  expect(od).toBeGreaterThan(-1);
  return zrodlo.slice(od, zrodlo.indexOf('\n}\n', od) + 3);
}

const job = (wpDbName: string) => ({
  target: { accountUsername: 'vinorgdw', domain: 'sl.hvln.pl' },
  wp: {
    databases: [
      { source: 'hvln_dashboard', target: { database: 'vinorgdw_hvln_dashboard', username: 'vinorgdw_hvln_dashboard', password: 'x' } },
    ],
  },
  _wpDbName: wpDbName,
});

function uruchom(wpDbName: string) {
  const dir = mkdtempSync(join(tmpdir(), 'wp-fixup-'));
  const bin = join(dir, 'bin');
  const dst = join(dir, 'public_html');
  execFileSync('mkdir', ['-p', bin, dst]);
  writeFileSync(join(dst, 'wp-config.php'), '<?php\n');
  const wywolania = join(dir, 'wp.log');
  // Udawane wp-cli: zapisuje wywołania, DB_NAME z wp-config podaje z env, reszta = sukces.
  writeFileSync(
    join(bin, 'wp'),
    `#!/bin/bash\necho "$*" >> "${wywolania}"\n[ "$1 $2 $3" = "config get DB_NAME" ] && { echo "${wpDbName}"; exit 0; }\nexit 0\n`,
  );
  // Udawane PHP: `php /ścieżka/wp args` → uruchamia phar (tu skrypt) z argumentami.
  writeFileSync(join(bin, 'php'), '#!/bin/bash\nexec "$@"\n');
  chmodSync(join(bin, 'wp'), 0o755);
  chmodSync(join(bin, 'php'), 0o755);
  const log = join(dir, 'krok.log');
  writeFileSync(log, '');

  const skrypt = [
    'vg_require() { return 0; }',
    `docroot_for() { echo "${dst}"; }`,
    'cms_fixup() { return 9; }',
    // secure_path z sudoers na EL: katalogu z wp/php w nim nie ma.
    'sudo() { shift 3; env PATH=/usr/bin:/bin "$@"; }',
    funkcja('wp_jako'),
    funkcja('run_wp_fixup'),
    'run_wp_fixup "$1" "$2"; echo "rc=$?"',
  ].join('\n');
  let wynik: string;
  try {
    wynik = execFileSync('bash', ['-c', skrypt, '_', JSON.stringify(job(wpDbName)), log], {
      env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` },
    }).toString();
  } catch (e) {
    wynik = String((e as { stdout?: Buffer }).stdout ?? '');
  }
  const wp = existsSync(wywolania) ? readFileSync(wywolania, 'utf8') : '';
  return { wynik, log: readFileSync(log, 'utf8'), wp };
}

describe('worker migracji — WP_FIXUP (wp-config.php po imporcie bazy)', () => {
  it('wp-cli działa mimo secure_path w sudo; baza z wp-config przeniesiona → wpisana do wp-config, krok OK', () => {
    const r = uruchom('hvln_dashboard');
    expect(r.log).not.toContain('command not found');
    expect(r.wp).toContain('config set DB_NAME vinorgdw_hvln_dashboard');
    expect(r.wp).toContain('core is-installed');
    expect(r.wynik).toContain('rc=0');
  });

  it('wp-config wskazuje inną bazę niż przeniesiona → nie nadpisuje wp-config.php, jasny powód', () => {
    const r = uruchom('hvln_wp');
    expect(r.wp).not.toContain('config set');
    expect(r.log).toContain('wp-config.php wskazuje bazę hvln_wp, a przeniesiona została inna (hvln_dashboard)');
    expect(r.wynik).toContain('rc=3');
  });

  it('ponowiony krok: wp-config już wskazuje bazę docelową → przechodzi', () => {
    const r = uruchom('vinorgdw_hvln_dashboard');
    expect(r.wp).toContain('config set DB_NAME vinorgdw_hvln_dashboard');
    expect(r.wynik).toContain('rc=0');
  });

  it('żadne wywołanie wp-cli nie idzie przez gołe `sudo … -- wp`', () => {
    expect(zrodlo).not.toMatch(/sudo -u "\$user" -- wp /);
  });
});
