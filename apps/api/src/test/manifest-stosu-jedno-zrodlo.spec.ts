import { execFileSync } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';
import { DOZWOLONE, SCIEZKA_MARIADB, STOS_WEZLA, stosJakoEnv } from '../servers/stos-wezla.js';
import { ALLOWED_DB_VERSIONS } from '../servers/node-tasks.service.js';
import { PLATFORM_SETTING_DEFAULTS, PLATFORM_SETTING_KEYS } from '../platform-settings/platform-settings.keys.js';

/**
 * PB-30 — jeden plik wersji dla floty: apps/api/src/servers/stos-wezla.ts. API czyta go wprost (zgodność,
 * strona „Wersje stosu floty”, walidacja upgrade'u bazy), węzeł dostaje go jako /etc/verris-stack.env
 * (bootstrap + agent co minutę) i skrypty czytają wersje wyłącznie stamtąd.
 *
 * Strażnik czerwieni się, gdy: skrypt albo kod TS wpisuje wersję, która należy do manifestu (własny literał
 * albo `${VERRIS_X:-literał}`), skrypt czyta zmienną manifestu, której manifest nie wystawia, albo lista
 * powielona w innym miejscu (API, panel, skrypt węzła) rozjeżdża się z manifestem.
 */

const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SKRYPTY = join(KORZEN, 'ops', 'scripts');
const API = join(KORZEN, 'apps', 'api', 'src');
const ADMIN = join(KORZEN, 'apps', 'admin-panel', 'src');
const PLIK_MANIFESTU = join(API, 'servers', 'stos-wezla.ts');

const wDol = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === 'node_modules' ? [] : wDol(join(dir, e.name))) : [join(dir, e.name)],
  );
const jestTestem = (p: string) => /\.(spec|test)\.tsx?$|__tests__|\/test\//.test(p);

/** Skrypty węzła (te same reguły, co pakiet onboardu) + kod TS generujący skrypty węzła. */
const skryptyWezla = [
  ...readdirSync(SKRYPTY)
    .filter((f) => /^(node-.*|verris-.*)\.sh$/.test(f))
    .map((f) => join(SKRYPTY, f)),
  ...readdirSync(join(SKRYPTY, 'lib')).map((f) => join(SKRYPTY, 'lib', f)),
];
const kodTs = [...wDol(API), ...wDol(ADMIN)].filter((p) => /\.tsx?$/.test(p) && !jestTestem(p));
const generatoryWApi = kodTs.filter((p) => p.startsWith(join(API, 'servers')) && p !== PLIK_MANIFESTU);

/** Treść bez linii-komentarzy (shell `#`, TS `//`, `/** … *​/`) — opisy historii nie są wykonywane. */
const bezKomentarzy = (p: string) =>
  readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(#|\/\/|\/\*|\*)/.test(l))
    .join('\n');

/** Zmienne, które wystawia manifest (/etc/verris-stack.env). */
const ZMIENNE_MANIFESTU = [...stosJakoEnv().matchAll(/^(VERRIS_[A-Z0-9_]+)=/gm)].map((m) => m[1]);
/** Zmienne z /etc/verris.conf (handshake bootstrapu), nie z manifestu. */
const ZMIENNE_VERRIS_CONF = ['VERRIS_API_URL', 'VERRIS_SERVER_ID', 'VERRIS_IDENTITY_TOKEN'];

/**
 * Wyjątki od skanu literałów — każdy z powodem; zgodność każdego z manifestem sprawdza osobny test niżej.
 * `plik` względem korzenia repo, `wzorzec` musi pasować do linii z literałem.
 */
const WYJATKI: { plik: string; wzorzec: RegExp; powod: string }[] = [
  {
    plik: 'ops/scripts/node-db-upgrade.sh',
    wzorzec: /^gov_id\(\) \{ case "\$1" in /,
    powod: 'tabela słów kluczowych CloudLinux MySQL Governor (fakt producenta, także dla wersji źródłowych 10.4–10.6)',
  },
  {
    plik: 'apps/admin-panel/src/app/(dashboard)/nodes/[id]/db-upgrade-panel.tsx',
    wzorzec: /^\s*\{ value: "[\d.]+", label: "MariaDB /,
    powod: 'etykiety i terminy wsparcia w panelu; wartości = ALLOWED_DB_VERSIONS (test niżej)',
  },
];
const wyjatek = (p: string, linia: string) =>
  WYJATKI.some((w) => w.plik === relative(KORZEN, p) && w.wzorzec.test(linia));

const ucieknij = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WERSJE = [
  ...new Set([
    STOS_WEZLA.php1,
    STOS_WEZLA.mariadb,
    STOS_WEZLA.litespeedLinia,
    ...STOS_WEZLA.phpAlt,
    ...Object.values(DOZWOLONE).flatMap((l) => l.map((x) => x.v)),
  ]),
].filter((v) => /^\d/.test(v));
const GOVERNORY = DOZWOLONE.mariadb.map((m) => m.governor);

/** Wzorce „wersja wpisana na sztywno” w skryptach węzła i w generatorach skryptów. */
const LITERALY_SHELL: { co: string; re: RegExp }[] = [
  { co: 'opcja CustomBuild z manifestu ustawiona literałem', re: /(build set|cb_set_option) +(php1_release|mariadb|webserver|modsecurity_ruleset) +["']?[A-Za-z0-9]/ },
  { co: 'kanał/build DirectAdmina literałem', re: /\bDA_(CHANNEL|COMMIT)=["']?[A-Za-z0-9]/ },
  { co: 'słowo kluczowe Governora literałem', re: new RegExp(`--mysql-version=(${GOVERNORY.join('|')})\\b`) },
  { co: 'lista wersji PHP literałem', re: /\b\d\.\d( +\d\.\d){2,}\b/ },
  { co: 'wersja z manifestu przypisana literałem', re: new RegExp(`=["']?(${WERSJE.map(ucieknij).join('|')})["']?(\\s|;|$)`) },
];
/** W kodzie TS: wersja z manifestu albo słowo Governora jako literał napisu, lista wersji po przecinku. */
const LITERAL_TS = new RegExp(
  `(['"\`])((${[...WERSJE, ...GOVERNORY].map(ucieknij).join('|')})|\\d\\.\\d(,\\d\\.\\d){2,})\\1`,
);

describe('PB-30 — manifest stosu: jedno źródło wersji', () => {
  it('stos-wezla.ts jest spójny sam ze sobą (wartości z list dozwolonych, ścieżka upgrade’u bazy)', () => {
    const v = (k: keyof typeof DOZWOLONE) => DOZWOLONE[k].map((x) => x.v as string);
    expect(v('php1')).toContain(STOS_WEZLA.php1);
    expect(v('mariadb')).toContain(STOS_WEZLA.mariadb);
    expect(v('daKanal')).toContain(STOS_WEZLA.daKanal);
    expect(v('litespeedLinia')).toContain(STOS_WEZLA.litespeedLinia);
    expect(STOS_WEZLA.governorMysql).toBe(DOZWOLONE.mariadb.find((m) => m.v === STOS_WEZLA.mariadb)!.governor);
    for (const m of v('mariadb')) expect(SCIEZKA_MARIADB as readonly string[]).toContain(m);
  });

  it('/etc/verris-stack.env odczytany w bashu daje dokładnie wartości manifestu', () => {
    const env = stosJakoEnv();
    const out = execFileSync(
      'bash',
      ['-c', `set -u; eval "$1"; printf '%s\\n' "$VERRIS_STACK_VERSION" "$VERRIS_DA_CHANNEL" "$VERRIS_DA_COMMIT" "$VERRIS_PHP1_RELEASE" "$VERRIS_MARIADB" "$VERRIS_GOVERNOR_MYSQL" "$VERRIS_WEBSERVER" "$VERRIS_MODSECURITY_RULESET" "$VERRIS_LITESPEED_LINE" "$VERRIS_PHP_VERSIONS" "$VERRIS_MARIADB_ALLOWED"`, '_', env],
      { encoding: 'utf8' },
    );
    const s = STOS_WEZLA;
    expect(out.split('\n').slice(0, -1)).toEqual([
      s.wersja, s.daKanal, s.daCommit, s.php1, s.mariadb, s.governorMysql, s.webserver, s.modsecurityRuleset,
      s.litespeedLinia, s.phpAlt.join(' '), DOZWOLONE.mariadb.map((m) => m.v).join(' '),
    ]);
  });

  it.each([...skryptyWezla, ...generatoryWApi].map((p) => [relative(KORZEN, p), p]))(
    '%s: bez wersji z manifestu wpisanych na sztywno',
    (_n, p) => {
      const linie = bezKomentarzy(p).split('\n');
      const trafienia = linie.flatMap((l) =>
        LITERALY_SHELL.filter((w) => w.re.test(l) && !wyjatek(p, l)).map((w) => `${w.co}: ${l.trim()}`),
      );
      expect(trafienia, 'Wersja należy do manifestu (stos-wezla.ts) — czytaj ją z $VERRIS_*.').toEqual([]);
    },
  );

  it('kod TS (API, panel admina) bierze wersje z manifestu, nie z literałów', () => {
    const trafienia = kodTs
      .filter((p) => p !== PLIK_MANIFESTU)
      .flatMap((p) =>
        bezKomentarzy(p)
          .split('\n')
          .filter((l) => LITERAL_TS.test(l) && !wyjatek(p, l))
          .map((l) => `${relative(KORZEN, p)}: ${l.trim()}`),
      );
    expect(trafienia, 'Importuj STOS_WEZLA / DOZWOLONE z servers/stos-wezla.ts.').toEqual([]);
  });

  it.each([...skryptyWezla, ...generatoryWApi].map((p) => [relative(KORZEN, p), p]))(
    '%s: zmienne manifestu bez własnych domyślnych i tylko takie, które manifest wystawia',
    (_n, p) => {
      const t = bezKomentarzy(p);
      // `${VERRIS_X:-wartość}` dla zmiennej manifestu = druga, rozjeżdżająca się wersja (dozwolone tylko „?” w logach).
      const domyslne = [...t.matchAll(/\$\{(VERRIS_[A-Z0-9_]+):-([^}]*)\}/g)]
        .filter((m) => ZMIENNE_MANIFESTU.includes(m[1]) && m[2] !== '?' && m[2] !== '')
        .map((m) => m[0]);
      expect(domyslne).toEqual([]);
      if (!t.includes('verris-stack.env')) return;
      // Skrypt czytający manifest: każda zmienna bez domyślnej, nieprzypisana w skrypcie i spoza /etc/verris.conf
      // musi być w manifeście (wcześniej profil czytał VERRIS_PHP_VERSIONS, którego manifest nie wystawiał).
      const czytane = new Set([...t.matchAll(/\$\{?(VERRIS_[A-Z0-9_]+)/g)].map((m) => m[1]));
      const brak = [...czytane].filter(
        (n) =>
          !ZMIENNE_MANIFESTU.includes(n) &&
          !ZMIENNE_VERRIS_CONF.includes(n) &&
          !new RegExp(`\\b${n}=`).test(t) &&
          !t.includes(`\${${n}:-`),
      );
      expect(brak, 'Dodaj zmienną do stosJakoEnv (stos-wezla.ts) albo daj jej wartość w skrypcie.').toEqual([]);
    },
  );

  it('skrypty i generatory czytają każdą zmienną, którą manifest wystawia (manifest bez martwych pól)', () => {
    const wszystko = [...skryptyWezla, ...generatoryWApi].filter((p) => p !== PLIK_MANIFESTU).map(bezKomentarzy).join('\n');
    const nieczytane = ZMIENNE_MANIFESTU.filter(
      (n) => !['VERRIS_STACK_VERSION', 'VERRIS_LITESPEED_LINE'].includes(n) && !new RegExp(`\\$\\{?${n}\\b`).test(wszystko),
    );
    // VERRIS_STACK_VERSION raportuje agent (wersja manifestu), VERRIS_LITESPEED_LINE porównuje API (zgodność).
    expect(nieczytane).toEqual([]);
  });

  it('słowa kluczowe Governora w skryptach węzła = manifest', () => {
    const fn = (plik: string, nazwa: string) => {
      const t = readFileSync(join(SKRYPTY, plik), 'utf8');
      const start = t.indexOf(`\n${nazwa}() {`) + 1;
      expect(start).toBeGreaterThan(0);
      const pierwsza = t.slice(start, t.indexOf('\n', start));
      return /\}\s*$/.test(pierwsza) ? pierwsza : t.slice(start, t.indexOf('\n}\n', start) + 3);
    };
    const govId = fn('node-db-upgrade.sh', 'gov_id');
    const wykryj = fn('node-hosting-profile.sh', 'governor_mysql_version_keyword');
    for (const { v, governor } of DOZWOLONE.mariadb) {
      expect(execFileSync('bash', ['-c', `${govId}\ngov_id "$1"`, '_', v], { encoding: 'utf8' }).trim()).toBe(governor);
      // `mysql -V` klienta MariaDB 10.x i 11.x (inny format) — VERRIS_GOVERNOR_MYSQL pusty, żeby nie zgadywał z manifestu.
      for (const linia of [`mysql  Ver 15.1 Distrib ${v}.5-MariaDB, for Linux (x86_64)`, `mysql from ${v}.5-MariaDB, client 15.2 for Linux (x86_64)`]) {
        const r = execFileSync('bash', ['-c', `${wykryj}\nVERRIS_GOVERNOR_MYSQL=; governor_mysql_version_keyword "$1"`, '_', linia], { encoding: 'utf8' });
        expect(r.trim(), linia).toBe(governor);
      }
    }
  });

  it('listy powielone poza manifestem = manifest (API upgrade bazy, panel admina, domyślne PHP klientów)', () => {
    const mariadb = DOZWOLONE.mariadb.map((m) => m.v);
    expect([...ALLOWED_DB_VERSIONS]).toEqual(mariadb);
    const panel = readFileSync(join(ADMIN, 'app', '(dashboard)', 'nodes', '[id]', 'db-upgrade-panel.tsx'), 'utf8');
    expect([...panel.matchAll(/\{ value: "([\d.]+)", label: "MariaDB /g)].map((m) => m[1])).toEqual(mariadb);
    expect(PLATFORM_SETTING_DEFAULTS[PLATFORM_SETTING_KEYS.PHP_AVAILABLE_VERSIONS].split(',')).toEqual(STOS_WEZLA.phpAlt);
  });
});
