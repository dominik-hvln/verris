import { execFileSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';

/**
 * 14.10 — plan uproszczenia migratora, pkt 3: strony spoza WordPressa. Krok „Konfiguracja strony” kończył się
 * dla nich „not a WordPress site, nothing to fix”: baza trafiała pod nową nazwę i użytkownika (prefiks konta),
 * a configuration.php / parameters.php / env.php / settings.php wskazywały starą — strona po migracji nie
 * łączyła się z bazą. Do tego bez wp-config.php klient musiał sam wpisać login i hasło bazy źródłowej.
 * Na prawdziwym fragmencie workera (perl + bash), z atrapami runuser i mysql.
 */
const SKRYPTY = resolve(import.meta.dirname, '..', '..', '..', '..', 'ops/scripts');
const WORKER = join(SKRYPTY, 'node-migration-worker.sh');

const PLIKI = {
  joomla: ['configuration.php', `<?php\nclass JConfig {\n\tpublic $dbtype = 'mysqli';\n\tpublic $host = 'localhost';\n\tpublic $user = 'stary_user';\n\tpublic $password = 'stare\\'haslo';\n\tpublic $db = 'stara_baza';\n\tpublic $dbprefix = 'jos_';\n}\n`],
  prestashop: ['app/config/parameters.php', `<?php return array (\n  'parameters' =>\n  array (\n    'database_host' => '127.0.0.1',\n    'database_port' => '3307',\n    'database_name' => 'stara_baza',\n    'database_user' => 'stary_user',\n    'database_password' => 'stare_haslo',\n    'database_prefix' => 'ps_',\n  ),\n);\n`],
  prestashop16: ['config/settings.inc.php', `<?php\ndefine('_DB_SERVER_', 'localhost');\ndefine('_DB_NAME_', 'stara_baza');\ndefine('_DB_USER_', 'stary_user');\ndefine('_DB_PASSWD_', 'stare_haslo');\n`],
  magento: ['app/etc/env.php', `<?php\nreturn [\n  'session' => ['save' => 'redis', 'redis' => ['host' => 'redis', 'password' => 'haslo-redisa']],\n  'db' => ['connection' => ['default' => [\n    'host' => 'db.stary.pl',\n    'dbname' => 'stara_baza',\n    'username' => 'stary_user',\n    'password' => 'stare_haslo',\n    'active' => '1',\n  ]]],\n];\n`],
  drupal: ['sites/default/settings.php', `<?php\n$databases = [];\n$databases['default']['default'] = array (\n  'database' => 'stara_baza',\n  'username' => 'stary_user',\n  'password' => 'stare_haslo',\n  'host' => 'localhost',\n  'driver' => 'mysql',\n);\n`],
} as const;
type Cms = keyof typeof PLIKI;

function wytnij(zrodlo: string, od: string, do_: string) {
  const a = zrodlo.indexOf(od);
  const b = zrodlo.indexOf(do_, a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return zrodlo.slice(a, b);
}

function srodowisko() {
  const zrodlo = readFileSync(WORKER, 'utf8');
  const kat = mkdtempSync(join(tmpdir(), 'verris-cms-'));
  const bin = join(kat, 'bin');
  const strona = join(kat, 'public_html');
  mkdirSync(bin);
  mkdirSync(strona);
  // runuser -u U -- polecenie… → polecenie… (test działa jako jeden użytkownik)
  writeFileSync(join(bin, 'runuser'), '#!/bin/bash\nwhile [ "$1" != "--" ]; do shift; done; shift; exec "$@"\n');
  chmodSync(join(bin, 'runuser'), 0o755);
  const funkcje = [
    wytnij(zrodlo, 'wp_config_db() {', '# Literał PHP w apostrofach'),
    wytnij(zrodlo, '# Strona innego CMS-a niż WordPress', 'run_http_check() {'),
  ].join('\n');
  const atrapy = [
    `. "${join(SKRYPTY, 'lib/migration-input-guard.sh')}"`,
    'ensure_mig_user() { :; }',
    `katalog_sekretow() { mktemp -d "${kat}/sek.XXXX"; }`,
    'plik_sekretu() { ( umask 077; printf "%s" "$3" > "$1/$2" ); echo "$1/$2"; }',
    // „mysql” przyjmuje tylko nowe dane bazy — tak jak prawdziwa baza docelowa po imporcie
    `jako_mig_env() { local pf="$2"; shift 2; echo "$*" >> "${kat}/mysql"; [ "$(cat "$pf")" = "${'$'}{BAZA_OK_HASLO:-}" ]; }`,
  ].join('\n');
  const uruchom = (wywolanie: string, env: Record<string, string> = {}) => {
    writeFileSync(join(kat, 't.sh'), `set -uo pipefail\n${atrapy}\n${funkcje}\n${wywolanie}\n`);
    try {
      const out = execFileSync('bash', [join(kat, 't.sh')], { stdio: 'pipe', env: { ...process.env, ...env, PATH: `${bin}:${process.env.PATH}` } }).toString();
      return { rc: 0, out };
    } catch (e) {
      const err = e as { status: number; stdout?: Buffer };
      return { rc: err.status, out: String(err.stdout ?? '') };
    }
  };
  const poloz = (cms: Cms) => {
    const [rel, tresc] = PLIKI[cms];
    const p = join(strona, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, tresc);
    chmodSync(p, 0o640);
    return p;
  };
  return { kat, strona, uruchom, poloz, log: () => (existsSync(join(kat, 'log')) ? readFileSync(join(kat, 'log'), 'utf8') : '') };
}

const JOB = JSON.stringify({
  wp: {
    targetDomain: 'firma.pl', sourceDomain: 'firma.pl',
    databases: [{ source: 'stara_baza', target: { database: 'konto_baza', username: 'konto_user', password: "n'owe\\haslo" } }],
  },
});

describe('migracja stron spoza WordPressa — dane bazy z konfiguracji CMS-a', () => {
  it.each(Object.keys(PLIKI) as Cms[])('%s: odczyt nazwy, loginu, hasła i hosta bazy (do importu bez wpisywania)', (cms) => {
    const s = srodowisko();
    s.poloz(cms);
    const { out } = s.uruchom(`cms_config_db u "${s.strona}"`);
    expect(out).toContain(`CMS\t${cms}\n`);
    expect(out).toContain('DB_NAME\tstara_baza\n');
    expect(out).toContain('DB_USER\tstary_user\n');
    expect(out).toContain(cms === 'joomla' ? "DB_PASSWORD\tstare'haslo\n" : 'DB_PASSWORD\tstare_haslo\n');
  });

  it('WordPress ma pierwszeństwo, jak dotąd', () => {
    const s = srodowisko();
    s.poloz('joomla');
    writeFileSync(join(s.strona, 'wp-config.php'), "<?php\ndefine('DB_NAME', 'wp_baza');\ndefine('DB_USER', 'wp_u');\ndefine('DB_PASSWORD', 'wp_h');\n");
    expect(s.uruchom(`cms_config_db u "${s.strona}"`).out).toBe('DB_NAME\twp_baza\nDB_USER\twp_u\nDB_PASSWORD\twp_h\nCMS\twordpress\n');
  });

  it.each(Object.keys(PLIKI) as Cms[])('%s: po imporcie konfiguracja wskazuje bazę docelową, prawa pliku bez zmian, połączenie sprawdzone', (cms) => {
    const s = srodowisko();
    const plik = s.poloz(cms);
    const r = s.uruchom(`cms_fixup "$JOB" "${s.kat}/log" u "${s.strona}"`, { JOB, BAZA_OK_HASLO: "n'owe\\haslo" });
    expect(r.rc, s.log()).toBe(0);
    expect(r.out.trim()).toBe('1');
    expect(statSync(plik).mode & 0o777).toBe(0o640);
    const po = s.uruchom(`cms_config_db u "${s.strona}"`).out;
    expect(po).toContain('DB_NAME\tkonto_baza\nDB_USER\tkonto_user\n');
    expect(po).toContain("DB_PASSWORD\tn'owe\\haslo\n");
    expect(po).toContain('DB_HOST\tlocalhost\n');
    expect(readFileSync(join(s.kat, 'mysql'), 'utf8')).toContain('-u konto_user konto_baza');
    expect(s.log()).not.toContain("n'owe");
    if (cms === 'magento') expect(readFileSync(plik, 'utf8')).toContain("'password' => 'haslo-redisa'");
    if (cms === 'prestashop') expect(readFileSync(plik, 'utf8')).toContain("'database_port' => ''");
  });

  it('dane bazy nie działają — krok kończy się błędem (zespół dostaje zadanie), nie „sukcesem”', () => {
    const s = srodowisko();
    s.poloz('drupal');
    const r = s.uruchom(`cms_fixup "$JOB" "${s.kat}/log" u "${s.strona}"`, { JOB, BAZA_OK_HASLO: 'inne' });
    expect(r.rc).toBe(3);
    expect(s.log()).toContain('nie otwiera się');
  });

  it('plik konfiguracji jako dowiązanie (np. do pliku roota) — bez zapisu, błąd', () => {
    const s = srodowisko();
    const prawdziwy = join(s.kat, 'cudzy.php');
    writeFileSync(prawdziwy, PLIKI.joomla[1]);
    symlinkSync(prawdziwy, join(s.strona, 'configuration.php'));
    const r = s.uruchom(`cms_fixup "$JOB" "${s.kat}/log" u "${s.strona}"`, { JOB, BAZA_OK_HASLO: "n'owe\\haslo" });
    expect(r.rc).toBe(3);
    expect(readFileSync(prawdziwy, 'utf8')).toBe(PLIKI.joomla[1]);
  });

  it('strona bez znanego CMS-a — bez zmian, krok przechodzi jak dotąd', () => {
    const s = srodowisko();
    writeFileSync(join(s.strona, 'index.html'), '<h1>ok</h1>');
    const r = s.uruchom(`cms_fixup "$JOB" "${s.kat}/log" u "${s.strona}"`, { JOB });
    expect([r.rc, r.out.trim()]).toEqual([0, '0']);
    expect(s.log()).toContain('konfiguracja strony bez zmian');
  });
});
