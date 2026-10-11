import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNodeUpdateScript } from './node-update.script.js';
import { wynikAktualizacji, ostrzezeniaAktualizacji } from './przeglad-wezla.service.js';

/**
 * Weryfikacja 11.10 — FLEET_UPDATE na t1 wypisał w środku CustomBuilda dwa razy
 * „Error: /etc/cagefs/cagefs.mp file contains incorrect path - /run/mysql …”, a skończył się
 * VERRIS_UPDATE_RESULT=ok („wszystko zaktualizowane”). Linie „Error:” z CustomBuilda to teraz ostrzeżenia
 * na końcu wyjścia i pole warnings=N w wyniku.
 */
function uruchom(wyjscieBuild: string, kodBuild = 0) {
  const T = mkdtempSync(join(tmpdir(), 'verris-upd-'));
  try {
    const cb = join(T, 'custombuild');
    const bin = join(T, 'bin');
    mkdirSync(cb);
    mkdirSync(bin);
    const build = join(cb, 'build');
    writeFileSync(build, `#!/usr/bin/env bash\nif [ "$1" = all ]; then cat <<'X'\n${wyjscieBuild}\nX\nexit ${kodBuild}; fi\nexit 0\n`);
    chmodSync(build, 0o755);
    for (const n of ['verris-fetch', 'yum', 'rpm', 'da']) {
      writeFileSync(join(bin, n), '#!/usr/bin/env bash\nexit 0\n');
      chmodSync(join(bin, n), 0o755);
    }
    const skrypt = join(T, 'upd.sh');
    writeFileSync(skrypt, loadNodeUpdateScript().replace('CB=/usr/local/directadmin/custombuild', `CB=${cb}`).replace(/bash \/usr\/local\/bin\/verris-agent-install\.sh/, 'true'));
    try {
      return { kod: 0, out: execFileSync('bash', [skrypt], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' }) };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { kod: err.status, out: err.stdout };
    }
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
}

const CAGEFS = 'Error: /etc/cagefs/cagefs.mp file contains incorrect path - /run/mysql is NOT a directory or does NOT exist';

describe('aktualizacja węzła — ostrzeżenia z CustomBuilda', () => {
  it('„Error:” w wyjściu CustomBuilda przy kodzie 0 → ok z ostrzeżeniem, linia na końcu wyjścia', () => {
    const { kod, out } = uruchom(['Updating users ...', CAGEFS, 'imapsync installed', CAGEFS, 'All parts have been installed'].join('\n'));
    expect(kod).toBe(0);
    expect(out).toContain('VERRIS_UPDATE_RESULT=ok warnings=1');
    expect(out).toContain(`[verris-update] OSTRZEŻENIE: CustomBuild: ${CAGEFS}`);
    expect(out.lastIndexOf('OSTRZEŻENIE')).toBeGreaterThan(out.lastIndexOf('All parts have been installed'));
    expect(wynikAktualizacji(out)).toBe('ok');
    expect(ostrzezeniaAktualizacji(out)).toBe(1);
  });

  it('czysty przebieg → ok bez ostrzeżeń', () => {
    const { kod, out } = uruchom('All parts have been installed');
    expect(kod).toBe(0);
    expect(out).toMatch(/VERRIS_UPDATE_RESULT=ok\n/);
    expect(ostrzezeniaAktualizacji(out)).toBe(0);
  });

  it('CustomBuild kończy się błędem → failed (fala staje), jak dotąd', () => {
    const { kod, out } = uruchom('Another instance of custombuild is holding the lock', 1);
    expect(kod).toBe(1);
    expect(out).toContain('VERRIS_UPDATE_RESULT=failed errors=1');
    expect(wynikAktualizacji(out)).toBe('failed');
  });
});
