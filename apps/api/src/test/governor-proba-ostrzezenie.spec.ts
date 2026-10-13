import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * 13.10 (t2): pierwsza instalacja MySQL Governora nie doczekała startu MariaDB (rollback), odzyskiwanie w profilu
 * postawiło MariaDB 11.4 + db_governor (dbctl działa), ale [FAIL] z samej próby zostawał w podsumowaniu
 * („OK=66 FAIL=1”) i Onboard LIVE kończył się błędem przy sprawnym węźle. Nieudana próba z odzyskiwaniem to
 * ostrzeżenie; werdykt FAIL daje dopiero stan po odzyskiwaniu.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const PROFIL = readFileSync(join(KORZEN, 'ops', 'scripts', 'node-hosting-profile.sh'), 'utf8');
const funkcja = (nazwa: string) => {
  const m = new RegExp(`^${nazwa}\\(\\) \\{[\\s\\S]*?^\\}`, 'm').exec(PROFIL);
  if (!m) throw new Error(`brak funkcji ${nazwa}`);
  return m[0];
};

function proba(govBlad: string | null) {
  const skrypt = `
    log_fail() { echo "FAIL:$*"; }
    log_warn() { echo "WARN:$*"; }
    strip_ansi() { cat; }
    governor_output_indicates_failure() { return 1; }
    DRY_RUN=0; PREFLIGHT_ONLY=0; GOVERNOR_PY=/bin/false
    ${funkcja('run_governor_py')}
    ${govBlad ? `GOV_BLAD=${govBlad} ` : ''}run_governor_py "Instalacja MySQL Governor" --install || echo "RC=$?"
  `;
  return spawnSync('bash', ['-c', skrypt], { encoding: 'utf8' });
}

describe('node-hosting-profile.sh — nieudana próba Governora przed odzyskiwaniem', () => {
  it('GOV_BLAD=warn: ostrzeżenie zamiast [FAIL], kod błędu zostaje (odzyskiwanie rusza)', () => {
    const r = proba('warn');
    expect(r.stdout).toContain('WARN:Instalacja MySQL Governor (rc=1)');
    expect(r.stdout).not.toContain('FAIL:');
    expect(r.stdout).toContain('RC=1');
  });

  it('bez GOV_BLAD: jak dotąd [FAIL]', () => {
    expect(proba(null).stdout).toContain('FAIL:Instalacja MySQL Governor (rc=1)');
  });

  it('instalacja i ponowne próby w odzyskiwaniu idą w trybie warn; werdykt po odzyskiwaniu nadal [FAIL]', () => {
    expect(PROFIL).toMatch(/GOV_BLAD=warn run_governor_py "Instalacja MySQL Governor"/);
    expect(PROFIL).toMatch(/GOV_BLAD=warn run_governor_py "Ponowny hook Governor"/);
    expect(PROFIL).toMatch(/log_fail "Instalacja MySQL Governor nie powiodła się"/);
    expect(PROFIL).toMatch(/log_fail "MySQL Governor — dbctl nadal nie działa/);
  });
});
