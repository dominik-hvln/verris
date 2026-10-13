import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * H-16 — odtworzenie konta z kopii off-site na INNYM węźle (ops/scripts/node-account-restore.sh, OFR_MODE=restore).
 * 13.10 na t2: konta na węźle docelowym jeszcze nie ma, więc `sed` na brakującym user.conf kończył się kodem 2,
 * a pipefail + set -e zabijały skrypt bez słowa (rc=2, pusty log) — zanim zlecił restore w DirectAdmin.
 * Restore DA: dokumentacja „Backup/Restore/Migration” (ip_choice=select&ip=… dla konta, którego jeszcze nie ma).
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-account-restore.sh');

function uruchom(opcje: { kontoJuzJest?: boolean; daZakladaKonto: boolean }) {
  const DIR = mkdtempSync(join(tmpdir(), 'odtworzenie-'));
  const bin = join(DIR, 'bin');
  const da = join(DIR, 'da');
  const home = join(DIR, 'home');
  mkdirSync(bin);
  mkdirSync(join(da, 'data', 'admin'), { recursive: true });
  mkdirSync(join(da, 'data', 'users'), { recursive: true });
  mkdirSync(join(home, 'admin', 'admin_backups'), { recursive: true });
  writeFileSync(join(da, 'directadmin'), '#!/bin/bash\nexit 0\n');
  chmodSync(join(da, 'directadmin'), 0o755);
  writeFileSync(join(da, 'data', 'admin', 'ip.list'), '62.171.162.57\n');
  writeFileSync(join(da, 'data', 'task.queue'), '');
  if (opcje.kontoJuzJest) {
    mkdirSync(join(da, 'data', 'users', 'rdeetgju'));
    writeFileSync(join(da, 'data', 'users', 'rdeetgju', 'user.conf'), 'creator=admin\nusertype=user\n');
  }
  writeFileSync(join(DIR, 'verris-backup.conf'), 'RCLONE_REMOTE="verris-crypt:"\nBACKUP_PREFIX="nodes/t2"\n');
  // Atrapa rclone: copyto zapisuje archiwum; „DirectAdmin” zakłada konto chwilę później (jak dataskq).
  const zaloz = opcje.daZakladaKonto
    ? `(sleep 1; mkdir -p "${da}/data/users/rdeetgju"; echo creator=admin > "${da}/data/users/rdeetgju/user.conf") &`
    : '';
  writeFileSync(
    join(bin, 'rclone'),
    `#!/bin/bash\n[ "$1" = copyto ] || exit 9\n[ "$2" = "verris-crypt:nodes/t1/rdeetgju/backups/user.admin.rdeetgju.tar.zst" ] || exit 8\necho archiwum > "$3"\n${zaloz}\nexit 0\n`,
  );
  chmodSync(join(bin, 'rclone'), 0o755);
  const r = spawnSync('bash', [SKRYPT], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      VERRIS_BACKUP_CONF: join(DIR, 'verris-backup.conf'),
      VERRIS_DA_DIR: da,
      VERRIS_HOME: home,
      OFR_MODE: 'restore',
      OFR_USER: 'rdeetgju',
      OFR_ARCHIVE: 'user.admin.rdeetgju.tar.zst',
      OFR_SOURCE_PREFIX: 'nodes/t1',
      OFR_IP: '62.171.162.57',
      OFR_WAIT_TRIES: '5',
      OFR_WAIT_SLEEP: '1',
    },
    encoding: 'utf8',
  });
  const kolejka = readFileSync(join(da, 'data', 'task.queue'), 'utf8');
  const archiwum = existsSync(join(home, 'admin', 'admin_backups', 'user.admin.rdeetgju.tar.zst'));
  rmSync(DIR, { recursive: true, force: true });
  return { kod: r.status, wyjscie: r.stdout, log: r.stderr, kolejka, archiwum };
}

describe('H-16 — odtworzenie na węźle, na którym konta jeszcze nie ma', () => {
  it('pobiera archiwum do admin_backups, zleca restore z IP węzła i czeka na konto', () => {
    const r = uruchom({ daZakladaKonto: true });
    expect(r.log).not.toContain('nieoczekiwany błąd');
    expect(r.kod).toBe(0);
    expect(r.archiwum).toBe(true);
    expect(r.kolejka).toContain('action=restore&ip_choice=select&ip=62.171.162.57&');
    expect(r.kolejka).toContain('&owner=admin&select0=user.admin.rdeetgju.tar.zst&type=admin');
    expect(r.wyjscie).toContain('VERRIS-OFFSITE-RESTORED rdeetgju');
  });

  it('DirectAdmin nie zakłada konta → błąd z przyczyną, nie ciche wyjście', () => {
    const r = uruchom({ daZakladaKonto: false });
    expect(r.kod).toBe(1);
    expect(r.log).toContain('nie założył konta rdeetgju');
  });

  it('konto już jest na węźle docelowym → odmowa bez zlecania restore', () => {
    const r = uruchom({ kontoJuzJest: true, daZakladaKonto: false });
    expect(r.kod).toBe(1);
    expect(r.log).toContain('już istnieje na tym węźle');
    expect(r.kolejka).toBe('');
  });
});
