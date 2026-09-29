import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * H-11 — podgląd archiwum kopii (ops/scripts/node-file-restore.sh, tryb list). Retest D3 29.09:
 * „Operacja nie powiodła się” dla katalogu „domains” z WordPressem — awk kończył czytanie po limicie
 * 2000 wpisów, tar dostawał SIGPIPE, a pipefail zamieniał to w błąd zadania (kod 141).
 * Uruchamiamy prawdziwy skrypt na prawdziwym tar.gz; runuser/getent/id to atrapy.
 */
const SKRYPT = join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-file-restore.sh');

describe('podgląd archiwum kopii (H-11)', () => {
  const DIR = mkdtempSync(join(tmpdir(), 'podglad-'));
  const wp = join(DIR, 'src', 'domains', 'd.pl', 'public_html', 'wp');
  mkdirSync(wp, { recursive: true });
  mkdirSync(join(DIR, 'src', 'imap'));
  mkdirSync(join(DIR, 'home', 'u1', 'backups'), { recursive: true });
  for (let i = 0; i < 2100; i++) writeFileSync(join(wp, `f${i}.php`), '');
  writeFileSync(join(DIR, 'src', 'domains', 'd.pl', 'public_html', 'index.php'), 'x');
  // Długie ścieżki jak w WordPressie: 2000 wpisów przekroczyłoby log zadania (120 000 znaków od końca).
  const dlugi = join(DIR, 'src', 'domains', 'd.pl', 'public_html', 'wp-content', 'plugins', 'wtyczka-o-bardzo-dlugiej-nazwie', 'assets');
  mkdirSync(dlugi, { recursive: true });
  for (let i = 0; i < 2100; i++) writeFileSync(join(dlugi, `plik-${i}-${'x'.repeat(60)}.js`), '');
  spawnSync('tar', ['czf', join(DIR, 'home', 'u1', 'backups', 'b.tar.gz'), 'domains', 'imap'], { cwd: join(DIR, 'src') });
  const bin = join(DIR, 'bin');
  mkdirSync(bin);
  const atrapy: Record<string, string> = {
    runuser: '#!/bin/bash\nshift 3; exec "$@"\n',
    getent: `#!/bin/bash\necho "u1:x:1:1::${DIR}/home/u1:/bin/bash"\n`,
    id: '#!/bin/bash\nexit 0\n',
  };
  for (const [n, t] of Object.entries(atrapy)) {
    writeFileSync(join(bin, n), t);
    chmodSync(join(bin, n), 0o755);
  }
  const lista = (prefiks: string) => {
    const r = spawnSync('bash', [SKRYPT], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, FR_MODE: 'list', FR_DA_USER: 'u1', FR_ARCHIVE: 'b.tar.gz', FR_PATH: prefiks },
      encoding: 'utf8',
    });
    return { rc: r.status, dlugosc: r.stdout.length, wpisy: r.stdout.split('\n').filter((l) => l.startsWith('VERRIS_WPIS ')), obciete: r.stdout.includes('VERRIS_OBCIETE') };
  };

  it('ponad 2000 wpisów pod prefiksem → sukces, bieżący poziom pełny i na początku, znacznik obcięcia', () => {
    const r = lista('domains');
    expect(r.rc).toBe(0);
    expect(r.wpisy[0]).toBe('VERRIS_WPIS d|0|domains/d.pl');
    expect(r.wpisy.length).toBeLessThanOrEqual(2000);
    expect(r.obciete).toBe(true);
  });

  it('wyjście mieści się w logu zadania (120 000 znaków) — bieżący poziom nie znika przy obcięciu', () => {
    const r = lista('domains/d.pl/public_html/wp-content');
    expect(r.rc).toBe(0);
    expect(r.dlugosc).toBeLessThan(110_000);
    expect(r.wpisy[0]).toBe('VERRIS_WPIS d|0|domains/d.pl/public_html/wp-content/plugins');
    expect(r.obciete).toBe(true);
  });

  it('katalog widoczny tylko w głębszych ścieżkach też jest na liście; bez prefiksu — korzeń archiwum', () => {
    const r = lista('');
    expect(r.rc).toBe(0);
    expect(r.wpisy.slice(0, 2)).toEqual(['VERRIS_WPIS d|0|domains', 'VERRIS_WPIS d|0|imap']);
  });
});
