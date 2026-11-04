import { execFileSync } from 'child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  DOZWOLONE,
  STOS_WEZLA,
  domyslnaWersjaPhp,
  sortujWersjePhp,
  stosJakoEnv,
  wersjePhpZRaportu,
} from '../servers/stos-wezla.js';
import { StosWezlaService } from '../servers/stos-wezla.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { PhpService } from '../subscriptions/php.service.js';

/**
 * Decyzja 14 (3.11.2026) — PHP 8.4, 8.5 i każda kolejna stabilna wersja; domyślna = przedostatnia najnowsza.
 * Wcześniej manifest floty instalował na sztywno 7.4–8.3 (P5-10: „stos dopuszcza 8.4 i 8.5, a manifest instaluje
 * do 8.3”), zapis manifestu w panelu utrwalał tę listę w bazie, a panel klienta pokazywał listę z ustawień platformy.
 * Teraz: węzeł instaluje wszystko z repozytorium CloudLinux od VERRIS_PHP_MIN, panel pokazuje wersje zainstalowane
 * na węźle konta (raport agenta), raport gotowości węzła sprawdza komplet.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');

/** Wycinek skryptu od `od` do `do_` (bez `do_`). */
function wycinek(plik: string, od: string, do_: string) {
  const t = czytaj(plik);
  const a = t.indexOf(od);
  const b = t.indexOf(do_, a);
  expect(a).toBeGreaterThan(-1);
  expect(b).toBeGreaterThan(a);
  return t.slice(a, b);
}

/** Atrapy dnf (lista pakietów w repozytorium) i selectorctl (wersje w PHP Selectorze). */
function bin(o: { repo: string[]; selektor: string[] }) {
  const kat = mkdtempSync(join(tmpdir(), 'verris-php-'));
  const b = join(kat, 'bin');
  mkdirSync(b);
  // dnf 4 dopisuje własny znak końca linii do --qf z „\n” — puste linie też muszą przejść.
  writeFileSync(join(b, 'dnf'), `#!/bin/bash\nprintf '%s\\n\\n' ${o.repo.map((p) => `'${p}'`).join(' ')}\n`);
  writeFileSync(join(b, 'selectorctl'), `#!/bin/bash\nprintf '%s\\n' ${o.selektor.map((v) => `'${v} ${v}.1 /opt/alt/php${v.replace('.', '')}/usr/bin/php-cgi'`).join(' ')}\n`);
  chmodSync(join(b, 'dnf'), 0o755);
  chmodSync(join(b, 'selectorctl'), 0o755);
  return { kat, b };
}

const REPO = [
  'alt-php56-cli', 'alt-php71-cli', 'alt-php74-cli', 'alt-php80-cli', 'alt-php81-cli', 'alt-php82-cli', 'alt-php83-cli',
  'alt-php84-cli', 'alt-php85-cli', 'alt-php86-cli', 'alt-php84-cli-debuginfo', 'alt-php-config',
];

describe('decyzja 14 — profil węzła: wszystkie wersje alt-php z repozytorium od minimum', () => {
  const funkcje = wycinek('ops/scripts/node-hosting-profile.sh', 'php_wersje_z_repo() {', '# B-02/B-03');
  const bash = (wywolanie: string, repo = REPO) => {
    const { b } = bin({ repo, selektor: [] });
    return execFileSync('bash', ['-c', `set -euo pipefail\n${funkcje}\n${wywolanie}`], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${b}:${process.env.PATH}` },
    }).trim();
  };

  it('lista z repozytorium: 8.6 (nowa, nieznana manifestowi) też, bez wersji poniżej minimum i bez innych pakietów', () => {
    expect(bash(`php_od_minimum "${STOS_WEZLA.phpMin}" $(php_wersje_z_repo)`)).toBe('8.6 8.5 8.4 8.3 8.2 8.1 8.0 7.4');
  });

  it('domyślna = przedostatnia najnowsza (8.10 jest nowsza niż 8.9); jedna wersja = ta jedna', () => {
    expect(bash('php_domyslna 8.4 8.6 8.5')).toBe('8.5');
    expect(bash('php_domyslna 8.9 8.10 7.4')).toBe('8.9');
    expect(bash('php_domyslna 8.4')).toBe('8.4');
  });

  it('profil instaluje i sprawdza listę z repozytorium; lista z manifestu tylko gdy repozytorium nie odpowiada', () => {
    const blok = wycinek('ops/scripts/node-hosting-profile.sh', '# Decyzja 14 — lista z repozytorium (po dodaniu repo php-els)', 'cldiag --check-php-selector');
    expect(blok.indexOf('php_wersje_z_repo')).toBeLessThan(blok.indexOf('VERRIS_PHP_VERSIONS'));
    expect(blok).toMatch(/if \[ -z "\$\{php_z_repo\/\/ \/\}" \]; then/);
    expect(blok).toContain('dnf groupinstall -y "alt-php${v/./}"');
    // repo php-els dodane PRZED odczytem listy
    const t = czytaj('ops/scripts/node-hosting-profile.sh');
    expect(t.indexOf('dnf install -y els-php-release')).toBeLessThan(t.indexOf('php_z_repo=$(php_wersje_z_repo'));
  });

  it('LiteSpeed: handler dla każdej zainstalowanej wersji od minimum, nie tylko z listy manifestu', () => {
    const f = wycinek('ops/scripts/node-hosting-profile.sh', 'configure_litespeed_alt_php() {', 'local zmiana bak');
    expect(f).toContain('for f in /opt/alt/php[0-9][0-9]*/usr/bin/lsphp; do');
    expect(f).not.toContain('VERRIS_PHP_VERSIONS');
  });
});

describe('decyzja 14 — raport gotowości węzła', () => {
  const funkcja = wycinek('ops/scripts/node-live-readiness.sh', 'sprawdz_php() {', '\nverify_live_readiness() {');
  const uruchom = (selektor: string[]) => {
    const { b } = bin({ repo: REPO, selektor });
    return execFileSync(
      'bash',
      ['-c', `set -Eeuo pipefail\nlog_ok() { echo "[OK] $*"; }\nlog_warn() { echo "[WARN] $*"; }\nlog_fail() { echo "[FAIL] $*"; }\n${funkcja}\nsprawdz_php`],
      { encoding: 'utf8', env: { ...process.env, PATH: `${b}:${process.env.PATH}`, VERRIS_PHP_MIN: STOS_WEZLA.phpMin } },
    );
  };

  it('nowa wersja w repozytorium, nie ma jej w PHP Selectorze — FAIL z nazwą wersji', () => {
    const out = uruchom(['7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5']);
    expect(out).toContain('[FAIL] PHP: w repozytorium są wersje 8.6, których nie ma w PHP Selectorze');
  });

  it('komplet — OK z listą od najnowszej (wersje spod minimum nie są wymagane)', () => {
    const out = uruchom(['5.6', '7.4', '8.0', '8.1', '8.2', '8.3', '8.4', '8.5', '8.6']);
    expect(out).toMatch(/\[OK\] PHP Selector: wszystkie wersje alt-php z repozytorium od 7\.4 \(8\.6 8\.5 8\.4 8\.3 8\.2 8\.1 8\.0 7\.4 ?\)/);
    expect(out).not.toContain('[FAIL]');
  });
});

describe('decyzja 14 — manifest floty i API', () => {
  it('manifest: 8.4 i 8.5 w liście zapasowej, minimum 7.4, domyślne PHP serwera = przedostatnia najnowsza', () => {
    expect(STOS_WEZLA.phpAlt).toEqual(expect.arrayContaining(['8.5', '8.4', '7.4']));
    expect(STOS_WEZLA.phpMin).toBe('7.4');
    expect(STOS_WEZLA.php1).toBe(domyslnaWersjaPhp(STOS_WEZLA.phpAlt));
    expect(DOZWOLONE.php1.map((x) => x.v as string)).toContain(STOS_WEZLA.php1);
    expect(stosJakoEnv()).toContain(`VERRIS_PHP_MIN='${STOS_WEZLA.phpMin}'`);
  });

  it('sortowanie i domyślna liczą 8.10 jako nowszą niż 8.9', () => {
    expect(sortujWersjePhp(['8.9', '8.10', '7.4', 'x', '8.9'])).toEqual(['8.10', '8.9', '7.4']);
    expect(domyslnaWersjaPhp(['8.9', '8.10'])).toBe('8.9');
    expect(domyslnaWersjaPhp([])).toBeNull();
  });

  it('raport węzła (altPhp): wersje od minimum, od najnowszej; brak raportu = pusta lista', () => {
    expect(wersjePhpZRaportu({ altPhp: { '8.3': '8.3.11', '8.6': '8.6.0', '5.6': '5.6.40', '8.5': '8.5.2' } })).toEqual(['8.6', '8.5', '8.3']);
    expect(wersjePhpZRaportu(null)).toEqual([]);
    expect(wersjePhpZRaportu({ altPhp: [] })).toEqual([]);
  });

  it('zapis manifestu w panelu nie zamraża listy alt-php (stary zapis z 7.4–8.3 nie wygrywa z kodem)', async () => {
    const prisma = {
      platformSetting: { findUnique: vi.fn(async () => ({ value: JSON.stringify({ ...STOS_WEZLA, php1: '8.3', phpAlt: ['8.3', '8.2'], phpMin: '8.2' }) })) },
    };
    const m = await new StosWezlaService(prisma as never, {} as never).pobierz();
    expect(m.php1).toBe('8.3'); // wybór admina zostaje
    expect(m.phpAlt).toEqual(STOS_WEZLA.phpAlt);
    expect(m.phpMin).toBe(STOS_WEZLA.phpMin);
  });

  it('wersje do wyboru dla konta = zainstalowane na jego węźle; bez raportu — ustawienie platformy', async () => {
    const prisma = {
      server: { findUnique: vi.fn(async () => ({ aktualizacje: { altPhp: { '8.4': '8.4.9', '8.5': '8.5.1', '8.6': '8.6.0' } } })) },
      platformSetting: { findMany: vi.fn(async () => [{ key: 'php.availableVersions', value: '8.3,8.2' }]) },
    };
    const s = new PlatformSettingsService(prisma as never, {} as never, {} as never);
    expect(await s.getAvailablePhpVersions('n1')).toEqual(['8.6', '8.5', '8.4']);
    expect(prisma.server.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'n1' } }));
    expect(await s.getAvailablePhpVersions()).toEqual(['8.3', '8.2']);
    prisma.server.findUnique.mockResolvedValueOnce({ aktualizacje: null } as never);
    expect(await s.getAvailablePhpVersions('n2')).toEqual(['8.3', '8.2']);
  });

  it('panel klienta: zalecana wersja = przedostatnia z dostępnych na węźle konta; wybór sprawdzany z tą samą listą', async () => {
    const account = { id: 'a1', userId: 'u1', serverId: 'n1', status: 'ACTIVE', daUsername: 'k', domain: 'a.pl', phpVersion: null, phpAppliedAt: null };
    const prisma = {
      subscription: { findFirst: vi.fn(async () => ({ id: 's1', account })) },
      account: { findUnique: vi.fn(async () => account), update: vi.fn(async () => account) },
      nodeTask: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 't1' })) },
      $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
    };
    const settings = { getAvailablePhpVersions: vi.fn(async (serverId?: string) => (serverId === 'n1' ? ['8.6', '8.5', '8.4'] : ['8.3'])) };
    const svc = new PhpService(prisma as never, { record: vi.fn() } as never, settings as never);
    const stan = await svc.statusForSubscription('s1', 'u1');
    expect(stan).toMatchObject({ availableVersions: ['8.6', '8.5', '8.4'], recommendedVersion: '8.5' });
    await expect(svc.setVersionForSubscription('s1', 'u1', '8.6')).resolves.toBeTruthy();
    await expect(svc.setVersionForSubscription('s1', 'u1', '8.3')).rejects.toThrow('Nieobsługiwana wersja PHP');
  });
});

/**
 * Decyzja 24 (4.11.2026) — krótkie nazwy PHP dla crona: profil węzła tworzy /usr/local/bin/phpXY → alt-php dla każdej
 * zainstalowanej wersji (i usuwa dowiązania do odinstalowanych), dopisuje je do CageFS; raport gotowości to sprawdza.
 * Na starym kodzie nie było ani `configure_php_aliases`, ani `sprawdz_php_aliasy` — wycinek nie znajdował funkcji.
 */
describe('decyzja 24 — krótkie nazwy /usr/local/bin/phpXY', () => {
  const profil = wycinek('ops/scripts/node-hosting-profile.sh', 'configure_php_aliases() {', '# Limity dyskowe kont');
  const raport = wycinek('ops/scripts/node-live-readiness.sh', 'sprawdz_php_aliasy() {', '\nverify_live_readiness() {');
  const LOGI = 'log_ok() { echo "[OK] $*"; }\nlog_skip() { echo "[SKIP] $*"; }\nlog_info() { echo "[INFO] $*"; }\nlog_warn() { echo "[WARN] $*"; }\nlog_fail() { echo "[FAIL] $*"; }\nstrip_ansi() { cat; }\n';

  /** Węzeł na niby: alt-php w `wersje`, katalog bin, conf.d CageFS, skeleton i atrapa cagefsctl zapisująca wywołania. */
  function wezel(wersje: string[]) {
    const kat = mkdtempSync(join(tmpdir(), 'verris-php-aliasy-'));
    const alt = join(kat, 'alt');
    const bindir = join(kat, 'bin');
    const cfs = join(kat, 'cagefs.d');
    const skel = join(kat, 'skel');
    const atrapy = join(kat, 'atrapy');
    for (const d of [bindir, cfs, skel, atrapy]) mkdirSync(d, { recursive: true });
    for (const v of wersje) {
      mkdirSync(join(alt, `php${v}`, 'usr', 'bin'), { recursive: true });
      writeFileSync(join(alt, `php${v}`, 'usr', 'bin', 'php'), '#!/bin/sh\n');
      chmodSync(join(alt, `php${v}`, 'usr', 'bin', 'php'), 0o755);
    }
    writeFileSync(join(atrapy, 'cagefsctl'), `#!/bin/bash\necho "$*" >> '${join(kat, 'cagefsctl.log')}'\n`);
    chmodSync(join(atrapy, 'cagefsctl'), 0o755);
    const env = {
      ...process.env,
      PATH: `${atrapy}:${process.env.PATH}`,
      VERRIS_ALT_DIR: alt,
      VERRIS_BIN_DIR: bindir,
      VERRIS_CAGEFS_CONF_DIR: cfs,
      VERRIS_CAGEFS_SKELETON: skel,
    };
    const profilUruchom = () =>
      execFileSync('bash', ['-c', `set -Eeuo pipefail\nDRY_RUN=0\nPREFLIGHT_ONLY=0\n${LOGI}cagefsctl_bin() { command -v cagefsctl; }\n${profil}\nconfigure_php_aliases`], { encoding: 'utf8', env });
    const raportUruchom = () => execFileSync('bash', ['-c', `set -Eeuo pipefail\n${LOGI}${raport}\nsprawdz_php_aliasy`], { encoding: 'utf8', env });
    const wywolaniaCagefs = () => (existsSync(join(kat, 'cagefsctl.log')) ? readFileSync(join(kat, 'cagefsctl.log'), 'utf8').trim().split('\n') : []);
    return { kat, alt, bindir, cfs, profilUruchom, raportUruchom, wywolaniaCagefs };
  }

  it('profil: dowiązanie dla każdej wersji (także nowej 8.6), wpis do CageFS i odświeżenie skeletonu; drugi przebieg bez zmian', () => {
    const w = wezel(['74', '84', '85', '86']);
    const out = w.profilUruchom();
    expect(out).toContain('[OK] PHP: krótkie nazwy');
    for (const v of ['74', '84', '85', '86']) {
      expect(lstatSync(join(w.bindir, `php${v}`)).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(w.bindir, `php${v}`))).toBe(join(w.alt, `php${v}`, 'usr', 'bin', 'php'));
    }
    const cfg = readFileSync(join(w.cfs, 'verris-php-aliasy.cfg'), 'utf8');
    expect(cfg).toContain('[verris-php-aliasy]');
    expect(cfg).toContain(`paths=${join(w.bindir, 'php74')}, ${join(w.bindir, 'php84')}, ${join(w.bindir, 'php85')}, ${join(w.bindir, 'php86')}`);
    expect(w.wywolaniaCagefs()).toEqual(['--force-update']);
    // idempotentnie: nic się nie zmieniło — bez ponownego (kosztownego) odświeżenia skeletonu
    w.profilUruchom();
    expect(w.wywolaniaCagefs()).toEqual(['--force-update']);
  });

  it('profil: odinstalowana wersja traci dowiązanie i wpis w CageFS; cudzego pliku i cudzego dowiązania nie rusza', () => {
    const w = wezel(['83', '84']);
    w.profilUruchom();
    rmSync(join(w.alt, 'php83'), { recursive: true });
    writeFileSync(join(w.bindir, 'php84x'), 'cudzy'); // nie pasuje do wzorca wersji — nietknięty
    symlinkSync('/usr/local/php82/bin/php', join(w.bindir, 'php82')); // np. CustomBuild — nie nasze
    const out = w.profilUruchom();
    expect(existsSync(join(w.bindir, 'php83'))).toBe(false);
    expect(() => lstatSync(join(w.bindir, 'php83'))).toThrow();
    expect(readlinkSync(join(w.bindir, 'php82'))).toBe('/usr/local/php82/bin/php');
    expect(readFileSync(join(w.bindir, 'php84x'), 'utf8')).toBe('cudzy');
    expect(readFileSync(join(w.cfs, 'verris-php-aliasy.cfg'), 'utf8')).toContain(`paths=${join(w.bindir, 'php84')}\n`);
    expect(w.wywolaniaCagefs()).toEqual(['--force-update', '--force-update']);
    expect(out).not.toContain('[FAIL]');
  });

  it('profil: wersja zajęta przez cudzy plik — ostrzeżenie, plik zostaje; raport gotowości FAIL z nazwą', () => {
    const w = wezel(['84']);
    writeFileSync(join(w.bindir, 'php84'), 'cudzy');
    const out = w.profilUruchom();
    expect(out).toMatch(/\[WARN\] PHP: .*php84 — istnieje i nie wskazuje na alt-php/);
    expect(readFileSync(join(w.bindir, 'php84'), 'utf8')).toBe('cudzy');
    expect(w.raportUruchom()).toMatch(/\[FAIL\] PHP: krótkie nazwy dla crona — .*php84 \(brak dowiązania/);
  });

  it('raport gotowości: komplet po profilu — OK; brak wpisu w CageFS albo dowiązanie do odinstalowanej wersji — FAIL', () => {
    const w = wezel(['84', '85']);
    expect(w.raportUruchom()).toContain('[FAIL] PHP: krótkie nazwy dla crona');
    w.profilUruchom();
    const ok = w.raportUruchom();
    expect(ok).toContain('[OK] PHP: krótkie nazwy');
    expect(ok).toContain('php84');
    expect(ok).toContain('php85');
    // skeleton CageFS bez dowiązań — tylko ostrzeżenie (NIEZWERYFIKOWANE, jak cagefsctl je przenosi)
    expect(ok).toMatch(/\[WARN\] PHP: brak w skeletonie CageFS/);

    writeFileSync(join(w.cfs, 'verris-php-aliasy.cfg'), `[verris-php-aliasy]\npaths=${join(w.bindir, 'php84')}\n`);
    expect(w.raportUruchom()).toMatch(/\[FAIL\] .*php85 \(brak w CageFS/);

    w.profilUruchom();
    symlinkSync(join(w.alt, 'php73', 'usr', 'bin', 'php'), join(w.bindir, 'php73'));
    expect(w.raportUruchom()).toMatch(/\[FAIL\] .*php73 \(wskazuje na odinstalowaną wersję\)/);
  });

  it('profil wywołuje krótkie nazwy po instalacji alt-php i handlerach LiteSpeed', () => {
    const t = czytaj('ops/scripts/node-hosting-profile.sh');
    const glowna = t.slice(t.lastIndexOf('configure_directadmin_custombuild\n'));
    expect(glowna.indexOf('configure_hosting_capabilities')).toBeLessThan(glowna.indexOf('configure_php_aliases'));
    expect(glowna.indexOf('configure_litespeed_alt_php')).toBeLessThan(glowna.indexOf('configure_php_aliases'));
    expect(czytaj('ops/scripts/node-live-readiness.sh')).toMatch(/sprawdz_php\n\s+sprawdz_php_aliasy/);
  });
});
