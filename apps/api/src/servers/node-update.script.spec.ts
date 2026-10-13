import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
function uruchom(wyjscieBuild: string, kodBuild = 0, straznik?: string, opcje: { stos?: string; options?: string; env?: Record<string, string> } = {}) {
  const T = mkdtempSync(join(tmpdir(), 'verris-upd-'));
  try {
    const cb = join(T, 'custombuild');
    const bin = join(T, 'bin');
    mkdirSync(cb);
    mkdirSync(bin);
    const build = join(cb, 'build');
    // Atrapa CustomBuilda zapisuje każde wywołanie — testy sprawdzają, CO zostało uruchomione.
    writeFileSync(build, `#!/usr/bin/env bash\necho "$*" >> "${join(T, 'wywolania')}"\nif [ "$1" = update_versions ]; then cat <<'X'\n${wyjscieBuild}\nX\nexit ${kodBuild}; fi\nexit 0\n`);
    if (opcje.options !== undefined) writeFileSync(join(cb, 'options.conf'), opcje.options);
    const stos = join(T, 'verris-stack.env');
    if (opcje.stos !== undefined) writeFileSync(stos, opcje.stos);
    chmodSync(build, 0o755);
    for (const n of ['verris-fetch', 'yum', 'rpm', 'da', 'sleep']) {
      writeFileSync(join(bin, n), '#!/usr/bin/env bash\nexit 0\n');
      chmodSync(join(bin, n), 0o755);
    }
    const skrypt = join(T, 'upd.sh');
    const stra = join(T, 'verris-straznik.sh');
    if (straznik !== undefined) {
      writeFileSync(stra, `#!/usr/bin/env bash\n[ "$1" = --sprawdz ] || exit 2\n${straznik}\n`);
      chmodSync(stra, 0o755);
    }
    writeFileSync(
      skrypt,
      loadNodeUpdateScript()
        .replace('CB=/usr/local/directadmin/custombuild', `CB=${cb}`)
        .replace(/bash \/usr\/local\/bin\/verris-agent-install\.sh/, 'true')
        .replaceAll('/usr/local/bin/verris-straznik.sh', stra)
        .replaceAll('/etc/verris-stack.env', stos),
    );
    try {
      const out = execFileSync('bash', [skrypt], { env: { ...process.env, ...opcje.env, PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' });
      return { kod: 0, out, wywolania: czytajWywolania(T) };
    } catch (e) {
      const err = e as { status: number; stdout: string };
      return { kod: err.status, out: err.stdout, wywolania: czytajWywolania(T) };
    }
  } finally {
    rmSync(T, { recursive: true, force: true });
  }
}

function czytajWywolania(T: string): string[] {
  try {
    return readFileSync(join(T, 'wywolania'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
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

  // 13.10 (t1): fala skończyła CustomBuild, a strony PHP padły na LVE — zadanie mówiło tylko o Roundcube.
  it('kontrola po aktualizacji (strażnik --sprawdz): problem → failed z powodem; zdrowy węzeł → ok', () => {
    const zle = uruchom('All parts have been installed', 0, 'echo "VERRIS_STRAZNIK_SPRAWDZ=blad LVE: 2 błędów w jądrze; strona d3.hvln.pl: HTTP 503"; exit 1');
    expect(zle.kod).toBe(1);
    expect(zle.out).toContain('BŁĄD: kontrola po aktualizacji: blad LVE: 2 błędów w jądrze; strona d3.hvln.pl: HTTP 503');
    expect(wynikAktualizacji(zle.out)).toBe('failed');
    const ok = uruchom('All parts have been installed', 0, 'echo VERRIS_STRAZNIK_SPRAWDZ=ok');
    expect(ok.kod).toBe(0);
    expect(ok.out).toContain('Kontrola po aktualizacji: VERRIS_STRAZNIK_SPRAWDZ=ok');
    expect(wynikAktualizacji(ok.out)).toBe('ok');
  });
});

// 13.10 — wyrównanie zgodnych t1/t2 kompilowało cały stos od zera („./build all d”, ~1 h) bez zmiany wersji.
// Dokumentacja DA „Upgrading Services”: aktualizacja = update_versions; „build all” nie do regularnego użycia.
describe('aktualizacja i wyrównanie — tylko to, co się zmieniło', () => {
  const STOS = "VERRIS_STACK_VERSION='2026-10-13.1'\nVERRIS_PHP1_RELEASE='8.3'\n";

  it('aktualizacja floty → update_versions, nigdy „build all”', () => {
    const { kod, wywolania } = uruchom('All parts have been installed');
    expect(kod).toBe(0);
    expect(wywolania).toContain('update_versions');
    expect(wywolania.some((w) => w.startsWith('all'))).toBe(false);
  });

  it('wyrównanie węzła zgodnego z manifestem → bez zmiany php1_release i bez przebudowy PHP', () => {
    const { kod, wywolania } = uruchom('ok', 0, undefined, { stos: STOS, options: 'php1_release=8.3\n', env: { UPD_WYROWNAJ: '1' } });
    expect(kod).toBe(0);
    expect(wywolania.some((w) => w.startsWith('set php1_release'))).toBe(false);
    expect(wywolania).not.toContain('php');
  });

  it('wyrównanie przy innym PHP → set php1_release z manifestu i przebudowa samego PHP', () => {
    const { kod, wywolania } = uruchom('ok', 0, undefined, { stos: STOS, options: 'php1_release=8.2\n', env: { UPD_WYROWNAJ: '1' } });
    expect(kod).toBe(0);
    expect(wywolania).toContain('set php1_release 8.3');
    expect(wywolania).toContain('php');
    expect(wywolania.some((w) => w.startsWith('all'))).toBe(false);
  });
});
