import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Przegląd 18.10: `doveconf -n | grep -q` przy pipefail — grep kończy przy pierwszym trafieniu, doveconf z dużym
 * wyjściem dostaje SIGPIPE, potok zwraca 141 → profil uznawał, że Dovecot nie przyjął konfiguracji, i ją usuwał.
 */
const PROFIL = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-hosting-profile.sh'), 'utf8');
// koniec funkcji: pierwsze „}” na początku linii PO heredoc-u (w heredoc-u jest „}” bloku passdb)
const FUNKCJA = /\nconfigure_dovecot_migration_master\(\) \{[\s\S]*?\nDCONF\n[\s\S]*?\n\}\n/.exec(PROFIL)![0];

it('duże wyjście doveconf z trafieniem na początku → [OK], konfiguracja zostaje', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dovecot-'));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dir, 'dovecot', 'conf.d'), { recursive: true });
  writeFileSync(join(dir, 'verris.conf'), "VERRIS_DOVECOT_MASTER_PASS='haslo'\n");
  // ~400 KB: trafienie w pierwszej linii, reszta > bufor potoku
  writeFileSync(
    join(bin, 'doveconf'),
    `#!/usr/bin/env bash\necho 'passwd_file_path = /etc/dovecot/verris-master-users'\nfor i in $(seq 1 8000); do echo "plugin_setting_$i = wartosc wartosc wartosc wartosc"; done\n`,
  );
  chmodSync(join(bin, 'doveconf'), 0o755);
  writeFileSync(join(bin, 'systemctl'), '#!/usr/bin/env bash\nexit 0\n');
  chmodSync(join(bin, 'systemctl'), 0o755);
  const r = spawnSync(
    'bash',
    ['-c', `set -Eeuo pipefail\nDRY_RUN=0; PREFLIGHT_ONLY=0\nlog_ok() { echo "[OK] $*"; }\nlog_fail() { echo "[FAIL] $*"; }\nlog_warn() { echo "[WARN] $*"; }\nlog_skip() { echo "[SKIP] $*"; }\nlog_info() { :; }\n${FUNKCJA}\nconfigure_dovecot_migration_master`],
    { encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, VERRIS_DOVECOT_DIR: join(dir, 'dovecot'), VERRIS_CONF_FILE: join(dir, 'verris.conf') } },
  );
  expect(`${r.stdout}${r.stderr}`).toContain('[OK] Dovecot: konto master migracji poczty');
  expect(existsSync(join(dir, 'dovecot', 'conf.d', '91-verris-migracja.conf'))).toBe(true);
});

it('żadne sprawdzenie w profilu nie robi `doveconf -n | grep` w potoku (sieve, konto master, radicale)', () => {
  const kod = PROFIL.split('\n').filter((l) => !l.trim().startsWith('#'));
  expect(kod.filter((l) => /doveconf -n[^|]*\| *grep/.test(l))).toEqual([]);
});
