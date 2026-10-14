import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

/**
 * Audyt 13.10 (#11): węzeł przechodzi ze wspólnych danych kopii floty na własne (subkonto + crypt) przy najbliższym
 * Onboard LIVE — `node-backup-config.sh --jesli-zmiana` przepisuje konfigurację tylko, gdy dane z panelu się zmieniły.
 */
const OPS = resolve(import.meta.dirname, '../../../../ops/scripts');

function srodowisko() {
  const T = mkdtempSync(join(tmpdir(), 'backup-config-'));
  const bin = join(T, 'bin');
  mkdirSync(bin);
  writeFileSync(join(T, 'verris.conf'), 'VERRIS_API_URL=http://127.0.0.1:9\nVERRIS_SERVER_ID=s1\nVERRIS_IDENTITY_TOKEN=t\n');
  writeFileSync(join(T, 'panel.env'), "VB_HOST='u1.your-storagebox.de'\nVB_PORT='23'\nVB_USER='u1'\nVB_PASS='p'\nVB_PATH='verris'\nVB_CRYPT_PASS='c'\nVB_CRYPT_SALT='s'\nVB_RETENTION_DAYS='30'\n");
  const stub = (n: string, t: string) => {
    writeFileSync(join(bin, n), `#!/bin/bash\n${t}\n`);
    chmodSync(join(bin, n), 0o755);
  };
  stub('verris-fetch', `cp "${join(T, 'panel.env')}" "$2"`);
  stub('ssh-keyscan', 'echo "[u1.your-storagebox.de]:23 ssh-ed25519 AAAA"');
  // Atrapa rclone: zapisuje argv; `obscure -` zwraca „OB:<stdin>”.
  stub('rclone', `printf '%s\\n' "$*" >> "${join(T, 'rclone.log')}"; if [ "$1" = obscure ]; then printf "OB:%s" "$(cat)"; fi; exit 0`);
  stub('hostname', 'echo t1');
  const uruchom = (...args: string[]) =>
    spawnSync('bash', [join(OPS, 'node-backup-config.sh'), ...args], {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        HOME: T,
        VERRIS_CONF: join(T, 'verris.conf'),
        VERRIS_RCLONE_DIR: join(T, 'rclone'),
        VERRIS_BACKUP_CONF: join(T, 'verris-backup.conf'),
      },
      encoding: 'utf8',
    });
  // Liczba przepisań konfiguracji = liczba zaciemnień hasła subkonta (3 wywołania obscure na przebieg).
  const utworzenia = () => (existsSync(join(T, 'rclone.log')) ? readFileSync(join(T, 'rclone.log'), 'utf8').split('\n').filter((l) => l === 'obscure -').length / 3 : 0);
  const konf = () => readFileSync(join(T, 'rclone', 'rclone.conf'), 'utf8');
  const argv = () => readFileSync(join(T, 'rclone.log'), 'utf8');
  return { T, uruchom, utworzenia, konf, argv, sprzataj: () => rmSync(T, { recursive: true, force: true }) };
}

describe('node-backup-config.sh --jesli-zmiana', () => {
  it('pierwszy raz konfiguruje i zapisuje skrót; te same dane → bez zmian; nowe dane (własne subkonto) → przepisuje', () => {
    const s = srodowisko();
    try {
      expect(s.uruchom().status).toBe(0);
      expect(s.utworzenia()).toBe(1);
      // Przegląd 15.10: hasło subkonta i klucze crypt nie trafiają do argumentów procesu.
      expect(s.argv()).not.toMatch(/\bp\b|\bc\b|\bs\b/);
      expect(s.konf()).toContain('[verris-remote]\ntype = sftp\nhost = u1.your-storagebox.de\nport = 23\nuser = u1\npass = OB:p\n');
      expect(s.konf()).toContain('[verris-crypt]\ntype = crypt\nremote = verris-remote:verris\npassword = OB:c\npassword2 = OB:s\n');
      expect(readFileSync(join(s.T, 'verris-backup.conf'), 'utf8')).toMatch(/^VB_ZRODLO_SHA=[0-9a-f]{64}$/m);

      const r = s.uruchom('--jesli-zmiana');
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('bez zmian');
      expect(s.utworzenia()).toBe(1);

      writeFileSync(join(s.T, 'panel.env'), "VB_HOST='u1.your-storagebox.de'\nVB_PORT='23'\nVB_USER='u1-sub1'\nVB_PASS='p1'\nVB_PATH=''\nVB_CRYPT_PASS='c1'\nVB_CRYPT_SALT='s1'\nVB_RETENTION_DAYS='30'\n");
      expect(s.uruchom('--jesli-zmiana').status).toBe(0);
      expect(s.utworzenia()).toBe(2);
      // Nowe dane zastępują sekcje, nie dopisują drugiej kopii.
      expect(s.konf().match(/\[verris-remote\]/g)).toHaveLength(1);
      expect(s.konf()).toContain('user = u1-sub1\npass = OB:p1\n');
      // Bez opcji istniejąca konfiguracja zostaje jak dotąd.
      expect(s.uruchom().stdout).toContain('pomijam');
    } finally {
      s.sprzataj();
    }
  });

  it('Onboard LIVE woła --jesli-zmiana, gdy kopie już są skonfigurowane', () => {
    const onboard = readFileSync(join(OPS, 'node-onboard-live.sh'), 'utf8');
    expect(onboard).toMatch(/backup_offsite_skonfigurowany; then\n\s+if bash "\$SCRIPT_DIR\/node-backup-config.sh" --jesli-zmiana; then/);
  });
});
