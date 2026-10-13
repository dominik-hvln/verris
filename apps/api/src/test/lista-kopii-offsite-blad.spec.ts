import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * H-16 — lista kopii off-site (ops/scripts/node-account-restore.sh, OFR_MODE=list).
 * 13.10 na t2: rclone kończył się błędem SSH („knownhosts: key mismatch”), skrypt połykał go (2>/dev/null)
 * i zgłaszał „brak archiwów” z kodem 0 — panel pokazywał pustą, „gotową” listę. Pusta lista tylko przy
 * kodzie 3 rclone (katalog nie istnieje, https://rclone.org/docs/#exit-code); każdy inny błąd kończy zadanie błędem.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-account-restore.sh');

function uruchom(rclone: string) {
  const DIR = mkdtempSync(join(tmpdir(), 'lista-kopii-'));
  const bin = join(DIR, 'bin');
  mkdirSync(bin);
  writeFileSync(join(DIR, 'verris-backup.conf'), 'RCLONE_REMOTE="verris-crypt:"\nBACKUP_PREFIX="nodes/t2"\n');
  writeFileSync(join(bin, 'rclone'), `#!/bin/bash\n${rclone}\n`);
  chmodSync(join(bin, 'rclone'), 0o755);
  const r = spawnSync('bash', [SKRYPT], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      VERRIS_BACKUP_CONF: join(DIR, 'verris-backup.conf'),
      OFR_MODE: 'list',
      OFR_USER: 'rdeetgju',
      OFR_SOURCE_PREFIX: 'nodes/t1',
    },
    encoding: 'utf8',
  });
  rmSync(DIR, { recursive: true, force: true });
  return { kod: r.status, wyjscie: r.stdout, log: r.stderr };
}

describe('lista kopii off-site — błąd rclone nie udaje pustej listy', () => {
  it('błąd połączenia (knownhosts) → zadanie kończy się błędem z przyczyną, bez VERRIS-OFFSITE-EMPTY', () => {
    const r = uruchom(`echo 'CRITICAL: NewFs: ssh: handshake failed: knownhosts: key mismatch' >&2; exit 1`);
    expect(r.kod).toBe(1);
    expect(r.wyjscie).toContain('VERRIS-OFFSITE-ERROR rclone=1');
    expect(r.wyjscie).not.toContain('VERRIS-OFFSITE-EMPTY');
    expect(r.log).toContain('knownhosts: key mismatch');
  });

  it('katalog nie istnieje (kod 3) → pusta lista, kod 0', () => {
    const r = uruchom(`echo 'directory not found' >&2; exit 3`);
    expect(r.kod).toBe(0);
    expect(r.wyjscie).toContain('VERRIS-OFFSITE-EMPTY');
  });

  it('archiwa → wiersze VERRIS-OFFSITE-FILE z prefiksu węzła źródłowego', () => {
    const r = uruchom(
      `[ "$1" = lsf ] && [ "\${@: -1}" = "verris-crypt:nodes/t1/rdeetgju/backups/" ] || exit 9\necho 'user.admin.rdeetgju.tar.zst|47513|2026-10-13 01:35:02'\necho 'notatka.txt|1|2026-10-13 01:35:02'`,
    );
    expect(r.kod).toBe(0);
    expect(r.wyjscie).toContain('VERRIS-OFFSITE-FILE user.admin.rdeetgju.tar.zst|47513|2026-10-13 01:35:02');
    expect(r.wyjscie).not.toContain('notatka.txt');
    expect(r.wyjscie).not.toContain('VERRIS-OFFSITE-EMPTY');
  });
});
