import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Audyt 13.10 (#11) — H-16 ze źródłem na WŁASNYCH danych kopii (subkonto Storage Boxa + własny crypt węzła).
 * Węzeł docelowy nie ma kluczy źródła w rclone.conf: skrypt pobiera subkonto tylko do odczytu i crypt źródła na czas
 * zadania (verris-fetch, podpis), buduje remote z samych zmiennych środowiska, sekrety nie trafiają do argv,
 * a katalog tymczasowy znika po zadaniu.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-account-restore.sh');
const TASK = '0c11af1c-aaaa-4bbb-bccc-cdddddddeeee';

function uruchom(env: Record<string, string> = {}) {
  const DIR = mkdtempSync(join(tmpdir(), 'odtw-zrodlo-'));
  const bin = join(DIR, 'bin');
  mkdirSync(bin);
  writeFileSync(join(DIR, 'verris-backup.conf'), 'RCLONE_REMOTE="verris-crypt:"\nBACKUP_PREFIX="nodes/t2"\n');
  const stub = (n: string, tresc: string) => {
    writeFileSync(join(bin, n), `#!/bin/bash\n${tresc}\n`);
    chmodSync(join(bin, n), 0o755);
  };
  stub(
    'verris-fetch',
    `echo "$1" >> "${DIR}/fetch.log"\n[ "$1" = "/agent/tasks/offsite-restore/zrodlo/${TASK}" ] || exit 4\n` +
      `printf "%s\\n" "SRC_HOST='u1.your-storagebox.de'" "SRC_PORT='23'" "SRC_USER='u1-sub2-ro'" "SRC_PASS='HASLO-RO-FIKCYJNE'" "SRC_PATH=''" "SRC_CRYPT_PASS='CRYPT-T1-FIKCYJNY'" "SRC_CRYPT_SALT='SOL-T1-FIKCYJNA'" > "$2"\n` +
      `echo "$(dirname "$2")" > "${DIR}/zr_dir"`,
  );
  stub('ssh-keyscan', 'echo "[u1.your-storagebox.de]:23 ssh-ed25519 AAAA"');
  stub(
    'rclone',
    [
      `printf '%s\\n' "$*" >> "${DIR}/argv.log"`,
      'if [ "$1" = obscure ]; then printf "OB:%s" "$(cat)"; exit 0; fi',
      `env | grep '^RCLONE_CONFIG_' | sort > "${DIR}/env.log"`,
      '[ "$1" = lsf ] && echo "user.admin.rdeetgju.tar.zst|123|2026-10-14 03:30:00"',
      'exit 0',
    ].join('\n'),
  );
  const r = spawnSync('bash', [SKRYPT], {
    env: {
      PATH: `${bin}:/usr/bin:/bin`,
      VERRIS_BACKUP_CONF: join(DIR, 'verris-backup.conf'),
      OFR_MODE: 'list',
      OFR_USER: 'rdeetgju',
      OFR_SOURCE_PREFIX: 'nodes/t1',
      OFR_ZRODLO_SERWER: 'srv-t1',
      OFR_TASK_ID: TASK,
      ...env,
    },
    encoding: 'utf8',
  });
  const czytaj = (n: string) => (existsSync(join(DIR, n)) ? readFileSync(join(DIR, n), 'utf8') : '');
  return { r, DIR, czytaj, sprzataj: () => rmSync(DIR, { recursive: true, force: true }) };
}

describe('H-16: źródło z własnymi danymi kopii (audyt 13.10, #11)', () => {
  it('lista z subkonta tylko do odczytu źródła; sekrety poza argv; katalog tymczasowy usunięty', () => {
    const s = uruchom();
    try {
      expect(s.r.status).toBe(0);
      expect(s.r.stdout).toContain('VERRIS-OFFSITE-FILE user.admin.rdeetgju.tar.zst|123|');
      expect(s.czytaj('fetch.log').trim()).toBe(`/agent/tasks/offsite-restore/zrodlo/${TASK}`);
      const lsf = s.czytaj('argv.log').split('\n').find((l) => l.startsWith('lsf'));
      expect(lsf).toContain('zrodlo:nodes/t1/rdeetgju/backups/');
      const env = s.czytaj('env.log');
      expect(env).toContain('RCLONE_CONFIG_ZRODLOSFTP_USER=u1-sub2-ro');
      expect(env).toContain('RCLONE_CONFIG_ZRODLOSFTP_PASS=OB:HASLO-RO-FIKCYJNE');
      expect(env).toContain('RCLONE_CONFIG_ZRODLO_REMOTE=zrodlosftp:');
      expect(env).toContain('RCLONE_CONFIG_ZRODLO_PASSWORD=OB:CRYPT-T1-FIKCYJNY');
      expect(env).toContain('RCLONE_CONFIG_ZRODLO_PASSWORD2=OB:SOL-T1-FIKCYJNA');
      for (const sekret of ['HASLO-RO-FIKCYJNE', 'CRYPT-T1-FIKCYJNY', 'SOL-T1-FIKCYJNA']) expect(s.czytaj('argv.log')).not.toContain(sekret);
      expect(existsSync(s.czytaj('zr_dir').trim())).toBe(false);
    } finally {
      s.sprzataj();
    }
  });

  it('bez identyfikatora zadania → odmowa, bez pobierania danych źródła', () => {
    const s = uruchom({ OFR_TASK_ID: '' });
    try {
      expect(s.r.status).not.toBe(0);
      expect(s.czytaj('fetch.log')).toBe('');
    } finally {
      s.sprzataj();
    }
  });

  it('źródło na wspólnych danych (bez OFR_ZRODLO_SERWER) → jak dotąd: prefiks źródła na remote węzła', () => {
    const s = uruchom({ OFR_ZRODLO_SERWER: '' });
    try {
      expect(s.r.status).toBe(0);
      expect(s.czytaj('fetch.log')).toBe('');
      expect(s.czytaj('argv.log')).toContain('verris-crypt:nodes/t1/rdeetgju/backups/');
    } finally {
      s.sprzataj();
    }
  });
});
