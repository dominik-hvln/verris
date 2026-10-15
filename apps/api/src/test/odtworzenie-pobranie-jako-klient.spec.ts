import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Noc 15.10 (przegląd node-root-files): „pobierz kopię off-site do mojego konta” (OFR_MODE=fetch, zleca klient)
 * sprawdzało, że ~/backups nie jest dowiązaniem, a potem ROOT zapisywał tam archiwum (rclone copyto) i robił chown.
 * Między sprawdzeniem a zapisem klient mógł podmienić katalog na dowiązanie — zapis roota (i obejście quota) poza
 * kontem. Teraz rclone strumieniuje archiwum (rclone cat, https://rclone.org/commands/rclone_cat/), a do pliku w
 * ~/backups pisze klient (runuser) — dowiązanie do cudzego katalogu kończy się odmową uprawnień.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-account-restore.sh');
const ARCH = 'user.admin.rdeetgju.tar.zst';

function uruchom(opcje: { rcloneBlad?: boolean } = {}) {
  const DIR = mkdtempSync(join(tmpdir(), 'pobranie-'));
  const bin = join(DIR, 'bin');
  const home = join(DIR, 'home');
  mkdirSync(bin);
  mkdirSync(join(home, 'rdeetgju', 'backups'), { recursive: true });
  writeFileSync(join(DIR, 'verris-backup.conf'), 'RCLONE_REMOTE="verris-crypt:"\nBACKUP_PREFIX="nodes/t1"\n');
  // Atrapa rclone: „cat” wypisuje archiwum, „copyto” (stary kod) zapisuje plik jako proces roota.
  writeFileSync(
    join(bin, 'rclone'),
    `#!/bin/bash\necho "$*" >> "${DIR}/rclone.log"\n` +
      (opcje.rcloneBlad ? 'printf czesc; exit 5\n' : '') +
      `case "$1" in\n  cat) [ "$2" = "verris-crypt:nodes/t1/rdeetgju/backups/${ARCH}" ] || exit 8; printf 'ARCHIWUM-ZST' ;;\n  copyto) printf 'ARCHIWUM-ZST' > "$3" ;;\n  *) exit 9 ;;\nesac\n`,
  );
  // Atrapa runuser: zapisuje, co i jako kto wykonano, i wykonuje bez zmiany użytkownika.
  writeFileSync(join(bin, 'runuser'), `#!/bin/bash\n[ "$1" = -u ] || exit 7\necho "$2 :: \${*:4}" >> "${DIR}/runuser.log"\nshift 3\nexec "$@"\n`);
  for (const n of ['rclone', 'runuser']) chmodSync(join(bin, n), 0o755);
  const r = spawnSync('bash', [SKRYPT], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      VERRIS_BACKUP_CONF: join(DIR, 'verris-backup.conf'),
      VERRIS_HOME: home,
      OFR_MODE: 'fetch',
      OFR_USER: 'rdeetgju',
      OFR_ARCHIVE: ARCH,
      OFR_PONOW_S: '0',
    },
    encoding: 'utf8',
  });
  const czytaj = (n: string) => (existsSync(join(DIR, n)) ? readFileSync(join(DIR, n), 'utf8') : '');
  const plik = join(home, 'rdeetgju', 'backups', ARCH);
  const wynik = {
    kod: r.status,
    wyjscie: r.stdout,
    log: r.stderr,
    runuser: czytaj('runuser.log'),
    rclone: czytaj('rclone.log'),
    tresc: existsSync(plik) ? readFileSync(plik, 'utf8') : null,
    tryb: existsSync(plik) ? statSync(plik).mode & 0o777 : null,
    tmp: existsSync(`${plik}.verris-tmp`),
  };
  rmSync(DIR, { recursive: true, force: true });
  return wynik;
}

describe('OFR fetch — archiwum w ~/backups zapisuje klient, nie root', () => {
  it('rclone cat → zapis przez runuser jako właściciel konta; plik kompletny, tylko dla klienta', () => {
    const r = uruchom();
    expect(r.log).not.toContain('[FAIL]');
    expect(r.kod).toBe(0);
    expect(r.rclone).toMatch(/^cat verris-crypt:nodes\/t1\/rdeetgju\/backups\/user\.admin\.rdeetgju\.tar\.zst/);
    expect(r.rclone).not.toContain('copyto');
    expect(r.runuser).toMatch(/^rdeetgju :: sh -c .*cat > /m);
    expect(r.runuser).toMatch(/^rdeetgju :: mv -f -- .*\.verris-tmp /m);
    expect(r.tresc).toBe('ARCHIWUM-ZST');
    expect(r.tryb).toBe(0o600);
    expect(r.wyjscie).toContain(`VERRIS-OFFSITE-FETCHED`);
  });

  it('przerwane pobranie → 3 próby, błąd zadania bez fałszywego „nieoczekiwany błąd”, bez niepełnego archiwum', () => {
    const r = uruchom({ rcloneBlad: true });
    expect(r.kod).not.toBe(0);
    expect(r.tresc).toBeNull();
    expect(r.tmp).toBe(false);
    expect(r.wyjscie).not.toContain('VERRIS-OFFSITE-FETCHED');
    expect(r.rclone.trim().split('\n')).toHaveLength(3);
    expect(r.log).toContain('po 3 próbach');
    expect(r.log).not.toContain('nieoczekiwany błąd');
  });
});
