import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { renderVerrisTaskRunScript, renderVerrisTasksScript } from './node-tasks-agent.install.js';
import { loadKreatorWpScript, ZNACZNIK_IMPORTERA } from './kreator-wp.script.js';

const OPS = resolve(import.meta.dirname, '../../../../ops/scripts');
/** Pola payloadu zadania KREATOR_WP, które wysyła KreatorWordpressService (podgląd, zamiana, cofnięcie). */
const POLA_API = ['tryb', 'daUser', 'domain', 'dir', 'klucz', 'paczka', 'dbName', 'dbUser', 'dbPass', 'adminUser', 'adminPass', 'adminEmail', 'locale', 'pliki', 'kopia', 'kopiaWp'];

function mapowanieRunnera(): Record<string, string> {
  const run = renderVerrisTaskRunScript();
  const m = /elif \[ "\$TASK_KIND" = "KREATOR_WP" \]; then[\s\S]*?payload_env "KWP" "(\{[^"]+\})"/.exec(run);
  if (!m) throw new Error('runner bez KREATOR_WP');
  return JSON.parse(m[1]!.replace(/'/g, '"')) as Record<string, string>;
}

describe('Paczka 124 – zadanie węzła KREATOR_WP (kontrakt agent ↔ API)', () => {
  it('runner przekazuje każde pole payloadu z API jako KWP_*, a skrypt nie czyta zmiennej spoza mapowania', () => {
    const mapa = mapowanieRunnera();
    expect(Object.keys(mapa).sort()).toEqual([...POLA_API].sort());
    const zmienne = new Set([...readFileSync(join(OPS, 'node-kreator-wp.sh'), 'utf8').matchAll(/\$\{?KWP_([A-Z]+(?:_[A-Z]+)*)/g)].map((m) => m[1]!));
    expect([...zmienne].filter((z) => !Object.values(mapa).includes(z))).toEqual([]);
    // Skrypt pobierany z API i podpisywany (PB-36), nie z dysku węzła.
    expect(renderVerrisTaskRunScript()).toContain('fetch_task_script "/agent/tasks/kreator-wp/script" "$RUN_BIN"');
    expect(renderVerrisTasksScript()).toMatch(/\|KREATOR_WP\) dispatch_generic ;;/);
  });

  it('skrypt z API ma importer PHP w środku (base64) – jeden podpisany plik; poprawna składnia bash i PHP', () => {
    const s = loadKreatorWpScript();
    expect(s).not.toContain(ZNACZNIK_IMPORTERA);
    const b64 = /printf '%s' "([A-Za-z0-9+/=]+)" \| base64 -d/.exec(s)?.[1];
    expect(Buffer.from(b64!, 'base64').toString('utf8')).toBe(readFileSync(join(OPS, 'node-kreator-wp-import.php'), 'utf8'));
    const kat = mkdtempSync(join(tmpdir(), 'kreator-wp-'));
    try {
      writeFileSync(join(kat, 's.sh'), s);
      execFileSync('bash', ['-n', join(kat, 's.sh')]);
      if (existsSync('/usr/bin/php')) expect(execFileSync('php', ['-l', join(OPS, 'node-kreator-wp-import.php')]).toString()).toMatch(/No syntax errors/);
    } finally {
      rmSync(kat, { recursive: true, force: true });
    }
  });

  it.each([
    [{ KWP_TRYB: 'usun' }, 'nieznany tryb'],
    [{ KWP_DA_USER: 'root;id' }, 'nieprawidłowy login konta'],
    [{ KWP_DOMAIN: 'x.pl/../../etc' }, 'nieprawidłowa domena'],
    [{ KWP_KLUCZ: '../../../etc' }, 'nieprawidłowy klucz podglądu'],
    [{ KWP_DIR: 'domains/x.pl/public_html/../../../etc' }, 'nieprawidłowy katalog strony'],
    [{ KWP_DIR: 'domains/inna.pl/public_html' }, 'katalog strony spoza domeny'],
  ])('dane spoza formatu (%o) → odmowa przed jakąkolwiek operacją', (zmiana, blad) => {
    const kat = mkdtempSync(join(tmpdir(), 'kreator-wp-'));
    try {
      writeFileSync(join(kat, 's.sh'), loadKreatorWpScript());
      const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', KWP_TRYB: 'podglad', KWP_DA_USER: 'klient1', KWP_DOMAIN: 'x.pl', KWP_DIR: 'domains/x.pl/public_html', KWP_KLUCZ: 'a'.repeat(24), ...zmiana };
      const r = spawnSync('bash', [join(kat, 's.sh')], { env, encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stdout).toContain(`[kreator-wp] BŁĄD: ${blad}`);
    } finally {
      rmSync(kat, { recursive: true, force: true });
    }
  });

  it('podgląd bez indeksowania i bez listowania katalogu; zamiana i cofnięcie z wycofaniem przy błędzie', () => {
    const s = readFileSync(join(OPS, 'node-kreator-wp.sh'), 'utf8');
    expect(s).toContain('"Options -Indexes"');
    expect(s).toContain('X-Robots-Tag');
    expect(s).toContain('option update blog_public 0');
    expect(s).toContain('trap wycofaj_zamiane EXIT');
    expect(s).toContain('trap wycofaj_cofniecie EXIT');
    expect(s).toMatch(/search-replace "\$ADRES_PODGLADU" "\$ADRES" --skip-columns=guid/);
    // Operacje na plikach klienta jako użytkownik konta (runuser/su), nie jako root.
    expect(s).not.toMatch(/^\s*(mv|rm|mkdir|cp) [^\n]*(\$\{?H\b|DOCROOT|PODGLAD)/m);
    expect(s).toContain('plugin delete hello akismet');
    expect(s).toContain('language core install');
  });
});
