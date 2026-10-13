import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * H-16 — porządek po przeniesieniu (decyzja Dominika 14.10: sierota zawieszona, usunięta po 24 h, z kopią):
 * OFR_MODE=archiwum robi admin-backup konta na STARYM węźle do katalogu tylko dla roota, zanim panel je zawiesi.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-account-restore.sh');

function uruchom(o: { konto: boolean; backupDziala: boolean }) {
  const DIR = mkdtempSync(join(tmpdir(), 'sierota-'));
  const da = join(DIR, 'da');
  const home = join(DIR, 'home');
  const arch = join(DIR, 'arch');
  const bin = join(DIR, 'bin');
  mkdirSync(bin);
  mkdirSync(join(da, 'data', 'users'), { recursive: true });
  mkdirSync(join(home, 'admin', 'admin_backups'), { recursive: true });
  if (o.konto) {
    mkdirSync(join(da, 'data', 'users', 'rdeetgju'));
    writeFileSync(join(da, 'data', 'users', 'rdeetgju', 'user.conf'), 'creator=admin\nusertype=user\n');
  }
  // Atrapa CLI DirectAdmina: admin-backup --destination=<dir> --user=<u> zapisuje archiwum.
  writeFileSync(
    join(da, 'directadmin'),
    o.backupDziala
      ? '#!/bin/bash\n[ "$1" = admin-backup ] || exit 9\nd="${2#--destination=}"; u="${3#--user=}"\necho dane > "$d/user.admin.$u.tar.zst"\n'
      : '#!/bin/bash\nexit 1\n',
  );
  chmodSync(join(da, 'directadmin'), 0o755);
  writeFileSync(join(bin, 'rclone'), '#!/bin/bash\nexit 0\n');
  chmodSync(join(bin, 'rclone'), 0o755);
  writeFileSync(join(DIR, 'verris-backup.conf'), 'RCLONE_REMOTE="verris-crypt:"\nBACKUP_PREFIX="nodes/t1"\n');
  const r = spawnSync('bash', [SKRYPT], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      VERRIS_BACKUP_CONF: join(DIR, 'verris-backup.conf'),
      VERRIS_DA_DIR: da,
      VERRIS_HOME: home,
      VERRIS_ARCH_DIR: arch,
      OFR_MODE: 'archiwum',
      OFR_USER: 'rdeetgju',
    },
    encoding: 'utf8',
  });
  return { r, arch, adir: join(home, 'admin', 'admin_backups') };
}

describe('node-account-restore.sh — archiwum konta-sieroty (H-16)', () => {
  it('archiwum w katalogu roota, nie w admin_backups; znacznik dla panelu', () => {
    const { r, arch, adir } = uruchom({ konto: true, backupDziala: true });
    expect(r.status).toBe(0);
    const pliki = readdirSync(arch);
    expect(pliki).toHaveLength(1);
    expect(pliki[0]).toMatch(/^\d{8}-\d{6}-user\.admin\.rdeetgju\.tar\.zst$/);
    expect(readdirSync(adir)).toEqual([]);
    expect(r.stdout).toMatch(new RegExp(`^VERRIS-ORPHAN-ARCHIVED rdeetgju ${arch}/${pliki[0]}$`, 'm'));
  });

  it('nieudany admin-backup albo brak konta → błąd zadania, bez znacznika', () => {
    for (const o of [{ konto: true, backupDziala: false }, { konto: false, backupDziala: true }]) {
      const { r, arch } = uruchom(o);
      expect(r.status).not.toBe(0);
      expect(r.stdout).not.toContain('VERRIS-ORPHAN-ARCHIVED');
      expect(existsSync(arch) ? readdirSync(arch) : []).toEqual([]);
    }
  });
});
